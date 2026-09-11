/**
 * One engine run of a team under one combo, and the lines/totals read off it. DOM-free: the
 * solver's worker, precompute.ts and the scratch A/B scripts all import `runTeam` from here.
 */
import type { Buff } from "./engine/gear.js";
import { State } from "./engine/state.js";
import { withTeam, equip, equipEnemy, setTracing } from "./engine/context.js";
import type { ChainGroup, Result } from "./engine/evaluate.js";
import { runRotations } from "./engine/rotation.js";
import type { ActionField } from "./engine/rotation.js";
import { TUNE_BREAK_ENEMY } from "./shared/tunebreak.js";
import type { Report } from "./display.js";
import type { Member, Combo } from "./solver.js";

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
        snap: parts[parts.length - 1]!.snap,
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
function variantSums(rotationLines: ChainGroup<Result>[][], members: Member[], variants: (Buff[] | null)[] | null, state: State): VariantRun[][] {
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

/** @param trace  keep per-entry traces and the resolved lines (the detail page); off for the bulk pass.
 *  @param variants  per member, main-stat Buffs to score as variants of `combo` (not with `trace`). */
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
    const c = combo[i]!;
    withTeam(state, () => { for (const g of m.loadout.pieces(c.weapon, c.echo, c.mainstat, c.sequence, c.matrix !== null, c.highSubs)) equip(g, 1); });
    const alts = variants?.[i];
    if (alts?.length) {
      const slot = state.slots[i]!;
      slot.variantOf = c.mainstat;
      slot.variants = alts;
      slot.variantAt = new Map();
      slot.variantUnsafe = alts.map(() => false);
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
