/**
 * One engine run of a team under one combo, and the lines/totals read off it. DOM-free: the
 * solver's worker, precompute.ts and the scratch A/B scripts all import `runTeam` from here.
 */
import type { Gear } from "./engine/gear.js";
import { State } from "./engine/state.js";
import { withTeam, equip, equipEnemy, setTracing, menuStats } from "./engine/context.js";
import type { ChainGroup, Result } from "./engine/evaluate.js";
import { ER_SHORT } from "./engine/evaluate.js";
import { runRotations } from "./engine/rotation.js";
import type { ActionField } from "./engine/rotation.js";
import { TUNE_BREAK_ENEMY } from "./shared/tunebreak.js";
import { erRollValue, ER_TOLERANCE } from "./shared/substats.js";
import { Stat } from "./engine/stats.js";
import { ctx } from "./engine/runtime.js";
import type { Report } from "./display.js";
import type { Member, Combo } from "./solver.js";
import type { Loadout } from "./engine/gear.js";

export interface TeamRun {
  /** The fight itself — null on a row rebuilt from a worker's score (`runFromScore`). */
  state: State | null;
  teamKey: string;
  members: Member[];
  combo: Combo[];
  /** [opener, loop 1, loop 2, loop 3] — only kept on a traced run; the table never reads them. */
  rotationLines: ChainGroup[][] | null;
  /** Mean over the four sections, each weighted equally. */
  total: number;
  bySlot: Map<string, number>;
  sectionTotals: number[];
  sectionBySlot: Map<string, number>[];
  /** Per member, per main-stat variant scored alongside this run (state.ts's `TeamMember.variants`). */
  variantRuns: VariantRun[][];
  /** The detail page's report, built on first open (page/model.ts's `detailFor`). */
  detail?: { report: Report };
}

export interface VariantRun {
  total: number;
  bySlot: Map<string, number>;
  sectionTotals: number[];
  sectionBySlot: Map<string, number>[];
  unsafe: boolean;
}

/** The snapshots a line's own totals fold: a group's members, or the lone cast. */
export const hitsOf = <S extends Result>(line: ChainGroup<S>): S[] => (line.members?.length ? line.members : [line.snap]);

const toLine = (snap: Result, spill = false): ChainGroup<Result> =>
  ({ id: snap.action.name, isChain: false, parts: [], snap, mv: snap.mv, avg: snap.avg, spill });

/**
 * A section's snapshots as report lines: an ActionGroup folds into one line carrying the summed
 * mv/damage but the *last* member's stat snapshot. `parts` is the whole span in resolve order,
 * spill follow-ups included; those are also emitted as their own `spill` lines so totals count them.
 */
function toLines(snaps: Result[]): ChainGroup<Result>[] {
  const lines: ChainGroup<Result>[] = [];
  for (let i = 0; i < snaps.length;) {
    const head = snaps[i]!;
    if (!head.group) { lines.push(toLine(head)); i++; continue; }
    const parts: ChainGroup<Result>["parts"] = [];
    const members: Result[] = [], extras: Result[] = [];
    let mv = 0, avg = 0, j = i, ended = false;
    for (; j < snaps.length; j++) {
      const snap = snaps[j]!;
      // `groupEnd` separates a second press of the same group from more of the first
      const member = !ended && snap.group === head.group;
      if (!member && snap.groupSpill !== head.group) break;
      const dmg = { avg: snap.avg };
      parts.push({ snap, dmg });
      if (member) {
        members.push(snap);
        mv += snap.mv;
        avg += dmg.avg;
        if (snap.groupEnd) ended = true;
      } else extras.push(snap);
    }
    lines.push({ id: head.group.name, isChain: true, parts, members, snap: members[members.length - 1]!, mv, avg });
    for (const snap of extras) lines.push(toLine(snap, true));
    i = j;
  }
  return collapseRepeats(lines);
}

/** Fold a back-to-back run of the same triggered hit on the same slot into one `x N` line. Field
 *  summons are left alone — `collapseFields` is their fold. */
function collapseRepeats(lines: ChainGroup<Result>[]): ChainGroup<Result>[] {
  const out: ChainGroup<Result>[] = [];
  for (let i = 0; i < lines.length;) {
    const head = lines[i]!;
    const snap = head.snap;
    let j = i + 1;
    if (!head.isChain && snap.triggered && !snap.action.field) {
      while (j < lines.length) {
        const next = lines[j]!;
        if (next.isChain || !next.snap.triggered || !!next.spill !== !!head.spill) break;
        // by name, not identity: a same-named variant reads as the same cast
        if (next.snap.action.name !== snap.action.name || next.snap.slot !== snap.slot) break;
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

let nextFieldKey = 0;

/**
 * Display-only: one `aggregate` summary line per field opening, placed under the cast that opened
 * it (or ahead of the first hit for a field carried in from an earlier section). The hits stay
 * lines of their own, tagged with the same `fieldKey`, so totals never count the summary.
 */
export function collapseFields(sections: ChainGroup[][]): ChainGroup[][] {
  const lines = sections.flat();
  const fields = new Map<ActionField, number[]>();
  lines.forEach((l, i) => {
    const field = l.snap.action.field;
    if (!field || !hitsOf(l).every((h) => h.action.field === field)) return;
    const at = fields.get(field);
    if (at) at.push(i); else fields.set(field, [i]);
  });
  if (!fields.size) return sections;

  const keyOf = new Map<number, string>();
  const after = new Map<number, ChainGroup[]>(), before = new Map<number, ChainGroup[]>();
  const file = (map: Map<number, ChainGroup[]>, at: number, summary: ChainGroup): void => {
    const list = map.get(at);
    if (list) list.push(summary); else map.set(at, [summary]);
  };
  for (const [field, at] of fields) {
    const opens = lines.flatMap((l, i) => (l.snap.opensFields.includes(field) ? [i] : []));
    // a hit belongs to the last opening at or before it; -1 = opened before this run's sections
    const groups = new Map<number, number[]>();
    for (const i of at) {
      let open = -1;
      for (const o of opens) { if (o > i) break; open = o; }
      const list = groups.get(open);
      if (list) list.push(i); else groups.set(open, [i]);
    }
    for (const [open, hits] of groups) {
      const key = `f${nextFieldKey++}`;
      for (const i of hits) keyOf.set(i, key);
      const parts = hits.flatMap((i) => {
        const l = lines[i]!;
        return l.members?.length ? l.parts : [{ snap: l.snap, dmg: { avg: l.avg } }];
      });
      const one = parts[0]!.snap.action.name;
      const summary: ChainGroup = {
        id: parts.every((p) => p.snap.action.name === one) ? `${one} x${parts.length}` : `${field.name} x${parts.length}`,
        isChain: true, aggregate: true, fieldKey: key, parts,
        members: parts.map((p) => p.snap),
        // the opening hit's: the row sits under the cast that opened the window, and a window
        // spanning a visit ends holding buffs that cast never had (Undulating Mist's ATK, bought
        // by the Iai after Hiyuki's Intro); each part still pays off its own snapshot
        snap: parts[0]!.snap,
        mv: hits.reduce((sum, i) => sum + lines[i]!.mv, 0),
        avg: hits.reduce((sum, i) => sum + lines[i]!.avg, 0),
      };
      if (open >= 0) file(after, open, summary); else file(before, hits[0]!, summary);
    }
  }

  const out: ChainGroup[][] = sections.map(() => []);
  let i = 0;
  sections.forEach((section, sec) => {
    for (const l of section) {
      for (const summary of before.get(i) ?? []) out[sec]!.push(summary);
      const key = keyOf.get(i);
      out[sec]!.push(key === undefined ? l : { ...l, fieldKey: key });
      for (const summary of after.get(i) ?? []) out[sec]!.push(summary);
      i++;
    }
  });
  return out;
}

/** A section's grand total and per-slot sum. `.slot`, not `.member`: a Tune Break banks under the
 *  enemy's own bucket. `avgOf` picks the line's own damage or one variant's. */
function sumSection(lines: ChainGroup<Result>[], avgOf: (line: ChainGroup<Result>) => number): { total: number; bySlot: Map<string, number> } {
  const bySlot = new Map<string, number>();
  let total = 0;
  for (const line of lines) {
    if (line.mv === 0) continue;
    const slot = line.snap.slot;
    const avg = avgOf(line);
    bySlot.set(slot, (bySlot.get(slot) ?? 0) + avg);
    total += avg;
  }
  return { total, bySlot };
}

/** The table's figures: the mean of the four sections, the opener counting as one loop. */
function sumRun(rotationLines: ChainGroup<Result>[][], avgOf: (line: ChainGroup<Result>) => number) {
  const bySlot = new Map<string, number>();
  const sectionTotals: number[] = [];
  const sectionBySlot: Map<string, number>[] = [];
  for (const lines of rotationLines) {
    const section = sumSection(lines, avgOf);
    sectionTotals.push(section.total);
    sectionBySlot.push(section.bySlot);
    for (const [slot, v] of section.bySlot) bySlot.set(slot, (bySlot.get(slot) ?? 0) + v / rotationLines.length);
  }
  // Every hit deals a whole number (damage.ts floors it), and the mean of four sections is the one
  // step that can land between two — so it is floored per slot, and the team's figure is what those
  // add to rather than its own floor, which keeps the column adding up to the total beside it.
  let total = 0;
  for (const [slot, v] of bySlot) {
    const whole = Math.floor(v);
    bySlot.set(slot, whole);
    total += whole;
  }
  return { total, bySlot, sectionTotals, sectionBySlot };
}

/** Every member's main-stat variants scored in one pass over the lines: a varied member's own hits
 *  count at that variant's damage, everyone else's as they were. A grouped line carries only its
 *  last hit's snapshot, so its hits are swapped one by one out of `parts`. Each accumulator adds
 *  the same values in the same order a separate `sumRun` per variant did, so the sums are
 *  bit-identical; the lines are just walked once instead of once per variant. */
function variantSums(rotationLines: ChainGroup<Result>[][], members: Member[], variants: (Combo[] | null)[] | null, state: State): VariantRun[][] {
  const counts = members.map((_, i) => variants?.[i]?.length ?? 0);
  if (!counts.some(Boolean)) return members.map(() => []);
  const n = rotationLines.length;
  const nameIndex = new Map(members.map((m, i) => [m.name, i]));
  // per member, per variant: running totals in the shape sumRun builds
  const acc = counts.map((c) => Array.from({ length: c }, () => ({ total: 0, bySlot: new Map<string, number>(), sectionTotals: [] as number[], sectionBySlot: [] as Map<string, number>[] })));
  const avgs = counts.map((c) => new Array<number>(c).fill(0));
  // slots as indices while summing — the Maps the callers read are built once per section, in the
  // same first-seen order a Map filled line by line would have
  const slotIndex = new Map<string, number>();
  const indexOf = (slot: string): number => { let i = slotIndex.get(slot); if (i === undefined) slotIndex.set(slot, i = slotIndex.size); return i; };
  for (const lines of rotationLines) {
    const secTotal = counts.map((c) => new Array<number>(c).fill(0));
    const secBySlot = counts.map((c) => Array.from({ length: c }, () => [] as number[]));
    const secOrder: string[] = [], seen = new Set<number>();
    for (const line of lines) {
      if (line.mv === 0) continue;
      // this line's damage under each variant: its own, plus each varied hit's difference
      for (let i = 0; i < counts.length; i++) for (let v = 0; v < counts[i]!; v++) avgs[i]![v] = line.avg;
      if (!line.isChain) {
        const snap = line.snap;
        const i = nameIndex.get(snap.member);
        if (i !== undefined && snap.variantAvg !== null) for (let v = 0; v < counts[i]!; v++) avgs[i]![v] = snap.variantAvg[v]!;
      } else {
        const hits = new Set(line.members ?? []);
        for (const p of line.parts) {
          if (!hits.has(p.snap)) continue;
          const i = nameIndex.get(p.snap.member);
          if (i === undefined || p.snap.variantAvg === null) continue;
          for (let v = 0; v < counts[i]!; v++) avgs[i]![v] = avgs[i]![v]! + (p.snap.variantAvg[v]! - p.dmg.avg);
        }
      }
      const slot = line.snap.slot, k = indexOf(slot);
      if (!seen.has(k)) { seen.add(k); secOrder.push(slot); }
      for (let i = 0; i < counts.length; i++) {
        for (let v = 0; v < counts[i]!; v++) {
          const avg = avgs[i]![v]!;
          const by = secBySlot[i]![v]!;
          by[k] = (by[k] ?? 0) + avg;
          secTotal[i]![v] = secTotal[i]![v]! + avg;
        }
      }
    }
    for (let i = 0; i < counts.length; i++) {
      for (let v = 0; v < counts[i]!; v++) {
        const a = acc[i]![v]!;
        a.sectionTotals.push(secTotal[i]![v]!);
        const by = new Map<string, number>();
        for (const slot of secOrder) by.set(slot, secBySlot[i]![v]![slotIndex.get(slot)!]!);
        a.sectionBySlot.push(by);
        for (const [slot, x] of by) a.bySlot.set(slot, (a.bySlot.get(slot) ?? 0) + x / n);
      }
    }
  }
  // the same floor sumRun ends on, so a variant's figures are read on the terms the row's are
  for (const list of acc) {
    for (const a of list) {
      for (const [slot, v] of a.bySlot) {
        const whole = Math.floor(v);
        a.bySlot.set(slot, whole);
        a.total += whole;
      }
    }
  }
  return acc.map((list, i) => list.map((a, v) => ({ ...a, unsafe: state.slots[i]!.variantUnsafe[v]! })));
}

/** Per team, the constant ER each member's rotation was last measured to need, and per member the
 *  need measured on each build of their own (`Combo.build`) they have run in. It is a property of
 *  the rotation and who is standing in it, not of the constant gear: the engine banks RealEnergy at
 *  a flat 100%, so what a window generated and what it generated weighted by the ER it was taken
 *  at solve for the requirement directly, and no constant ER the build carries can move it. What
 *  moves it is buffs — a member's own weapon and echoes far more than a teammate's picks — so an
 *  unrun combo is guessed off the last run of the same build, and off the team's last run only
 *  where there is none. What the build carries decides how much of it is already paid. */
const ER_LAST = new Map<string, number[]>();
const ER_SEEN = new Map<string, Map<string, number>[]>();

/** The requirement as one *combo* actually showed it, keyed by that combo — the team-level figure
 *  above is only the opening guess, and the buffs a build holds move the real one. Filled by
 *  `runTeam` off the run it just did, so a combo pays at most one corrective re-run and every read
 *  of it after is free. */
const ER_NEED_AT = new Map<string, number[]>();
const needKey = (teamKey: string, combo: Combo[]): string => `${teamKey}|${combo.map((c) => c.key).join(",")}`;

/** Per loadout, the constant ER a combo's own gear adds up to — the same pieces recur across a
 *  team's combos, so this is read far more often than it is filled. */
const ER_HELD = new WeakMap<Loadout, Map<string, number>>();

/** The opening guess for a combo not yet run. No probe run: a team opens on the tier each kit
 *  named and the first run of it measures what was really needed (`runTeam`), which both corrects
 *  that run and becomes the guess every combo after starts from. */
export function erNeedFor(teamKey: string, members: Member[], combo: Combo[]): number[] {
  const last = ER_LAST.get(teamKey), seen = ER_SEEN.get(teamKey);
  return members.map((_, i) => seen?.[i]?.get(combo[i]!.build) ?? last?.[i] ?? 0);
}

/** Bank what a run of `combo` measured (or, with `member`, what one cast of theirs asked for). */
function remember(teamKey: string, combo: Combo[], need: number[], member = -1): void {
  ER_LAST.set(teamKey, need);
  let seen = ER_SEEN.get(teamKey);
  if (!seen) {
    seen = combo.map(() => new Map());
    ER_SEEN.set(teamKey, seen);
  }
  need.forEach((n, i) => {
    if (member < 0 || member === i) seen![i]!.set(combo[i]!.build, n);
  });
}

/** What each member's own gear, this combo's picks included, already pays towards that. */
function erHeld(m: Member, c: Combo, rolls: number): number {
  let per = ER_HELD.get(m.loadout);
  if (!per) {
    per = new Map();
    ER_HELD.set(m.loadout, per);
  }
  const key = `${c.key}|${rolls}`;
  const hit = per.get(key);
  if (hit !== undefined) return hit;
  // constant stats are one piece's own, so the pieces' ER sums — and each is priced once (`gearEr`)
  let held = 0;
  for (const g of m.loadout.pieces(c.weapon, c.echo, c.mainstat, c.sequence, c.matrix !== null, c.highSubs, rolls)) held += gearEr(g);
  per.set(key, held);
  return held;
}

/** How many ER rolls each member's spread has to carry under this combo. Can come back higher than
 *  any spread can pay — `erFeasible` is what tests that, and the solver drops those combos rather
 *  than the team, since a sonata or mainslot carrying ER often covers what the rotation needs. */
export function erRollsFor(teamKey: string, members: Member[], combo: Combo[]): number[] {
  const need = ER_NEED_AT.get(needKey(teamKey, combo)) ?? erNeedFor(teamKey, members, combo);
  return members.map((m, i) => erRollsWanted(m, combo[i]!, need[i] ?? 0));
}

/** One member's ER rolls under one combo, given the requirement `need`. */
function erRollsWanted(m: Member, c: Combo, need: number): number {
  const base = m.loadout.substat.tiers[0]!.rolls;
  if (!need) return base;
  return base + Math.max(0, Math.ceil((need - erHeld(m, c, base) - ER_TOLERANCE) / erRollValue()));
}

/** How much constant ER one piece carries — the mainstat sweep compares two picks by this rather
 *  than pricing a whole combo for each. Per Buff, so it is computed once for the whole solve. */
const GEAR_ER = new WeakMap<Gear, number>();
export function gearEr(gear: Gear): number {
  let er = GEAR_ER.get(gear);
  if (er === undefined) {
    er = menuStats([gear]).reduce((n, e) => n + (e.stat === Stat.Er ? e.value : 0), 0);
    GEAR_ER.set(gear, er);
  }
  return er;
}

/** Whether every member of this team can actually fill their bar on this combo's gear. */
export function erFeasible(teamKey: string, members: Member[], combo: Combo[]): boolean {
  const rolls = erRollsFor(teamKey, members, combo);
  return members.every((m, i) => rolls[i]! <= m.loadout.substat.tiers[m.loadout.substat.tiers.length - 1]!.rolls);
}

/** What each member's Liberation actually needed over this run — the same solve `erNeedFor` does,
 *  read off the slots the run left behind rather than off a probe. Independent of the ER the build
 *  was wearing: the constant it ran at comes back out of the buffed term. */
function measureNeed(members: Member[], _combo: Combo[], state: State): number[] {
  return members.map((m, i) => (m.loadout.resonator.maxEnergy ? state.slots[i]!.erWorst : 0));
}

/** `combo` with member `i`'s replaced by `alt` — the combo one of their main-stat variants stands for. */
const variantCombo = (combo: Combo[], i: number, alt: Combo): Combo[] => combo.map((c, j) => (j === i ? alt : c));

/** @param trace  keep per-entry traces and the resolved lines (the detail page); off for the bulk pass.
 *  @param variants  per member, combos differing from `combo` in that member's main stat alone, to
 *  score as engine variants of it (not with `trace`). */
export function runTeam(teamKey: string, members: Member[], combo: Combo[], trace = false, variants: (Combo[] | null)[] | null = null): TeamRun {
  // restored, not cleared: `erRollsFor` probes a team by running it, and that run sits *inside* the
  // traced one that triggered it — clearing here would leave the outer run untraced from then on
  const outer = ctx.tracing;
  setTracing(trace);
  try {
    // Each attempt equips the tier the requirement known so far asks for. A Liberation that fires
    // on a bar that tier could never fill abandons the run where it stands (evaluate's ER_SHORT)
    // rather than finishing it, and the next attempt wears what that cast wanted — strictly more,
    // so the loop climbs. A run that finishes measures what it really needed, and one that wore
    // more than that is run again on the tier it measured: what a run reports is always the tier
    // `erRollsFor` names for it afterwards, whatever guess it started from. At the top tier there
    // is nothing left to climb to, so the run finishes short, which is what `erFeasible` reports.
    // `floor` keeps a climb from being undone by the descent — they disagree only by rounding.
    const floor = members.map(() => 0);
    const top = (m: Member): number => m.loadout.substat.tiers[m.loadout.substat.tiers.length - 1]!.rolls;
    for (;;) {
      const key = needKey(teamKey, combo);
      const known = ER_NEED_AT.has(key);
      const worn = erRollsFor(teamKey, members, combo).map((r, i) => Math.max(r, floor[i]!));
      const guard = members.map((m, i) => !combo[i]!.highSubs && worn[i]! < top(m));
      let run: TeamRun;
      try {
        run = runTeamInner(teamKey, members, combo, trace, variants, worn, guard);
      } catch (e) {
        if (e !== ER_SHORT) throw e;
        // the cast that gave up says what it wanted; raise that member and equip again
        const at = members.findIndex((m) => m.name === ER_SHORT.member);
        const raised = (ER_NEED_AT.get(key) ?? erNeedFor(teamKey, members, combo)).slice();
        raised[at] = Math.max(raised[at] ?? 0, ER_SHORT.need);
        remember(teamKey, combo, raised, at);
        if (known) ER_NEED_AT.set(key, raised);
        floor[at] = erRollsFor(teamKey, members, combo)[at]!;
        continue;
      }
      // a run that finished tells us what it really needed, so every combo after starts from there
      const measured = run.state ? measureNeed(members, combo, run.state) : null;
      if (measured && !known) {
        ER_NEED_AT.set(key, measured);
        remember(teamKey, combo, measured);
      }
      if (measured) {
        const asked = erRollsFor(teamKey, members, combo);
        const over = members.some((m, i) => !combo[i]!.highSubs && m.loadout.substat.at(Math.max(asked[i]!, floor[i]!)) !== m.loadout.substat.at(worn[i]!));
        if (over) continue;
      }
      // A variant wore the tier the requirement known before the run asked of it, so one that ends
      // up on another tier than a run of its own would — the one the measurement names, since it
      // has the same buffs and so the same need — is scored for real instead. Every alt combo is
      // known on the same terms as this one, which is what that run of its own reads.
      if (variants && measured) {
        members.forEach((m, i) => {
          const alts = variants[i];
          if (!alts?.length) return;
          const slot = run.state!.slots[i]!;
          alts.forEach((alt, v) => {
            const at = variantCombo(combo, i, alt);
            const altKey = needKey(teamKey, at);
            if (!ER_NEED_AT.has(altKey)) ER_NEED_AT.set(altKey, measured);
            const asked = erRollsFor(teamKey, members, at)[i]!;
            if (!alt.highSubs && m.loadout.substat.at(asked) !== m.loadout.substat.at(slot.variantRolls[v]!)) run.variantRuns[i]![v]!.unsafe = true;
          });
        });
      }
      return run;
    }
  } finally {
    setTracing(outer);
  }
}

function runTeamInner(teamKey: string, members: Member[], combo: Combo[], trace: boolean, variants: (Combo[] | null)[] | null, erRolls = erRollsFor(teamKey, members, combo), guard: boolean[] = []): TeamRun {
  const state = new State(members.map((m) => m.name));
  members.forEach((m, i) => {
    state.active = i;
    const c = combo[i]!;
    withTeam(state, () => { for (const g of m.loadout.pieces(c.weapon, c.echo, c.mainstat, c.sequence, c.matrix !== null, c.highSubs, erRolls[i])) equip(g, 1); });
    state.slots[i]!.constEr = erHeld(m, c, erRolls[i]!);
    state.slots[i]!.erGuard = guard[i] ?? false;
    const alts = variants?.[i];
    if (alts?.length) {
      const slot = state.slots[i]!;
      slot.variantOf = c.mainstat;
      slot.variants = alts.map((alt) => alt.mainstat);
      slot.variantAt = new Map();
      slot.variantUnsafe = alts.map(() => false);
      // a main stat carrying ER moves the tier the spread wears, so each variant's base swaps the
      // substat piece along with its main stat — at the rolls the requirement known so far asks.
      // A variant has this build's buffs and so its need: where its own combo is not yet known,
      // this one's measurement is the guess, ahead of the team's
      const worn = c.highSubs ? null : m.loadout.substat.at(erRolls[i]!);
      slot.variantSubOf = worn;
      const own = ER_NEED_AT.get(needKey(teamKey, combo)) ?? erNeedFor(teamKey, members, combo);
      slot.variantRolls = alts.map((alt) => erRollsWanted(m, alt, (ER_NEED_AT.get(needKey(teamKey, variantCombo(combo, i, alt))) ?? own)[i] ?? 0));
      slot.variantSubs = slot.variantRolls.map((rolls) => {
        const piece = c.highSubs ? null : m.loadout.substat.at(rolls);
        return piece === worn ? null : piece;
      });
    }
  });
  state.active = 0;
  // the enemy is equipped like a member: the Tune Break resonator fires the break itself (tunebreak.ts)
  withTeam(state, () => equipEnemy(TUNE_BREAK_ENEMY));

  // one continuous fight cut into opener + three loops, so loop-only state reaches steady state
  const rotationLines = runRotations(state, members.map((m, i) => m.loadout.rotationAt(combo[i]!.sequence)), 4).map(toLines);

  const { total, bySlot, sectionTotals, sectionBySlot } = sumRun(rotationLines, (line) => line.avg);
  const variantRuns = variantSums(rotationLines, members, variants, state);

  // a traced run's results are the full snapshots (see `Result`), which the report's own folds read
  return { state, teamKey, members, combo, rotationLines: trace ? collapseFields(rotationLines as ChainGroup[][]) : null, total, bySlot, sectionTotals, sectionBySlot, variantRuns };
}

/** A row's figures as plain data a worker can post back: `TeamRun`'s four fields, Maps as entries. */
export interface RowScore { total: number; bySlot: [string, number][]; sectionTotals: number[]; sectionBySlot: [string, number][][] }

export const scoreOf = (run: TeamRun): RowScore =>
  ({ total: run.total, bySlot: [...run.bySlot], sectionTotals: run.sectionTotals, sectionBySlot: run.sectionBySlot.map((by) => [...by]) });

export const runFromScore = (teamKey: string, members: Member[], combo: Combo[], score: RowScore): TeamRun => ({
  state: null, teamKey, members, combo, rotationLines: null, variantRuns: [],
  total: score.total, bySlot: new Map(score.bySlot), sectionTotals: score.sectionTotals,
  sectionBySlot: score.sectionBySlot.map((by) => new Map(by)),
});
