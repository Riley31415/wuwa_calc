/**
 * One engine run of a team under one combo, and the lines/totals read off it. DOM-free: the
 * solver's worker, precompute.ts and the scratch A/B scripts all import `runTeam` from here.
 */
import type { Gear } from "../engine/gear.js";
import { State } from "../engine/state.js";
import type { HitRecord, PieceSwap } from "../engine/state.js";
import { withTeam, equip, equipEnemy, setTracing, menuStats } from "../engine/context.js";
import type { ChainGroup, Result, ResolvedSnapshot } from "../engine/evaluate.js";
import { ER_SHORT, settleGauges } from "../engine/evaluate.js";
import { runRotations } from "../engine/rotation.js";
import type { ActionField } from "../engine/rotation.js";
import { TUNE_BREAK_ENEMY } from "../shared/tunebreak.js";
import { erRollValue, ER_TOLERANCE } from "../shared/substats.js";
import { Stat } from "../engine/stats.js";
import { ctx } from "../engine/runtime.js";
import type { Report } from "../page/display.js";
import type { Member, Combo } from "./solver.js";
import type { Loadout } from "../engine/gear.js";

export interface TeamRun {
  /** The fight itself — null on a row rebuilt from a worker's score (`runFromScore`). */
  state: State | null;
  teamKey: string;
  members: Member[];
  combo: Combo[];
  /** [opener, loop 1, loop 2, loop 3] — only kept on a traced run; the table never reads them. */
  rotationLines: ChainGroup[][] | null;
  /** Adjusted DPR: the four rotations' damage over the time they took as a rate, over 26 seconds
   *  (DPS × 26). */
  total: number;
  bySlot: Map<string, number>;
  /** Each rotation's damage — the opener and the three loops. */
  sectionTotals: number[];
  sectionBySlot: Map<string, number>[];
  /** Every hit of the four rotations. */
  fightTotal: number;
  fightBySlot: Map<string, number>;
  /** How long the four rotations took, in seconds — what DPS and the loop length divide by. */
  seconds: number;
  /** How long each rotation took, in seconds — first cast to the next rotation's (the fight's end
   *  for the last); they add up to `seconds`. */
  sectionSeconds: number[];
  /** Per member, per main-stat variant scored alongside this run (state.ts's `TeamMember.variants`). */
  variantRuns: VariantRun[][];
  /** The detail page's report, built on first open (page/model.ts's `detailFor`). */
  detail?: { report: Report };
  /** What a run carrying main-stat variants leaves for `deriveRun` to read other main stats off. */
  base?: VariantBase;
}

/** A variant run's fight as `deriveRun` reads it: its hits by section, the ER rolls it and each
 *  variant wore, the engine's verdict on each variant, and the requirement it measured. */
export interface VariantBase {
  hits: HitRecord[][];
  complete: number;
  frames: number;
  worn: number[];
  alts: (Combo[] | null)[];
  rolls: number[][];
  engineUnsafe: boolean[][];
  measured: number[] | null;
  /** Per member, every requirement their Liberations asked for (`TeamMember.erWants`). */
  wants: number[][];
}

export interface VariantRun {
  total: number;
  bySlot: Map<string, number>;
  sectionTotals: number[];
  sectionBySlot: Map<string, number>[];
  fightTotal: number;
  fightBySlot: Map<string, number>;
  seconds: number;
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
    // the row reads the member its group names (a dash group's cut press, not the dash), and a
    // group named for nothing (a marker's dash group) takes that member's own name
    const trailing = members[members.length - 1]!.dashDropped ? 0 : head.group.trailing;
    const shown = members[Math.max(0, members.length - 1 - trailing)]!;
    // a group left with one press (a summon echo's dash group, whose dash never came) is just that press
    if (members.length === 1) lines.push(toLine(shown));
    else lines.push({ id: head.group.name || shown.action.name, isChain: true, parts, members, snap: shown, mv, avg });
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
        if (next.isChain || !next.snap.triggered || !!next.spill !== !!head.spill || next.snap.action.field) break;
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

/** Adjusted DPR: `damage` dealt over `frames`, as a rate per second, over 26 seconds. */
const adjusted = (damage: number, frames: number): number => Math.floor((damage * 26 * 60) / frames);

/** A run's figures: the rotations (the first `complete` sections), each on its own and together as
 *  adjusted DPR over the frames they took, and the whole fight's damage beside them. */
type RunSums = Pick<TeamRun, "total" | "bySlot" | "sectionTotals" | "sectionBySlot" | "fightTotal" | "fightBySlot" | "seconds">;

/** One walk over a fight's hits (all whole numbers): the run's figures at `avgAt` (handed the hit's member's
 *  index), member i's variants with their own hits at `src[i][v]` (-1 `avgAt`'s). `quiet` drops what a run wouldn't record. */
function sumHits(sections: HitRecord[][], complete: number, frames: number, members: Member[], avgAt: (h: HitRecord, i: number | undefined) => number,
  src: number[][], unsafe: (i: number, v: number) => boolean, quiet: boolean): RunSums & { variantRuns: VariantRun[][] } {
  const nameIndex = new Map(members.map((m, i) => [m.name, i]));
  const slotIndex = new Map<string, number>(), slotNames: string[] = [];
  // per member, variant v's delta on slot k sits at `v * stride + k`: every member and the enemy fit
  const stride = members.length + 1;
  const secs = sections.map((lines) => {
    const by: number[] = [], order: number[] = [];
    let total = 0;
    const deltaBy = src.map((s) => new Float64Array(s.length * stride));
    const deltaTotal = src.map((s) => new Float64Array(s.length));
    // hits run in stretches of one member's, so each lookup is kept for the next hit
    let member: string | null = null, i: number | undefined, slot: string | null = null, k: number | undefined;
    for (const h of lines) {
      if (h.member !== member) {
        member = h.member;
        i = nameIndex.get(member);
      }
      const own = i === undefined ? null : src[i]!;
      const p = avgAt(h, i);
      if (quiet && p === 0 && !own?.length) continue;
      if (h.slot !== slot) {
        slot = h.slot;
        k = slotIndex.get(slot);
      }
      if (k === undefined) {
        slotIndex.set(h.slot, k = slotNames.length);
        slotNames.push(h.slot);
        if (k >= stride) throw new Error(`teamrun.ts: more report slots than ${stride}`);
      }
      if (by[k] === undefined) {
        by[k] = 0;
        order.push(k);
      }
      by[k] = by[k]! + p;
      total += p;
      if (!own?.length || h.variantAvg === null) continue;
      const at = deltaBy[i!]!, sums = deltaTotal[i!]!;
      for (let v = 0; v < own.length; v++) {
        const s = own[v]!;
        const d = (s < 0 ? h.avg : h.variantAvg[s]!) - p;
        at[v * stride + k] = at[v * stride + k]! + d;
        sums[v] = sums[v]! + d;
      }
    }
    return { by, order, total, deltaBy, deltaTotal };
  });
  // one member's variant `v` (-1 the run's own): each section's slots and total, and the slots' wholes
  // over the complete sections, floored as the column floors them
  const figures = (i: number, v: number): RunSums => {
    const sectionTotals: number[] = [], sectionBySlot: Map<string, number>[] = [];
    const fightBySlot = new Map<string, number>(), bySlot = new Map<string, number>();
    const whole: number[] = [], wholeOrder: number[] = [];
    let fightTotal = 0;
    secs.forEach((s, sec) => {
      const delta = v < 0 ? null : s.deltaBy[i]!;
      const by = new Map<string, number>();
      for (const k of s.order) {
        const x = s.by[k]! + (delta ? delta[v * stride + k]! : 0);
        by.set(slotNames[k]!, x);
        if (sec < complete) {
          if (whole[k] === undefined) {
            whole[k] = 0;
            wholeOrder.push(k);
          }
          whole[k] = whole[k]! + x;
        }
      }
      const sum = v < 0 ? s.total : s.total + s.deltaTotal[i]![v]!;
      if (sec < complete) {
        sectionTotals.push(sum);
        sectionBySlot.push(by);
      }
      for (const [slot, x] of by) fightBySlot.set(slot, (fightBySlot.get(slot) ?? 0) + x);
      fightTotal += sum;
    });
    let total = 0;
    for (const k of wholeOrder) {
      const x = adjusted(whole[k]!, frames);
      bySlot.set(slotNames[k]!, x);
      total += x;
    }
    return { total, bySlot, sectionTotals, sectionBySlot, fightTotal, fightBySlot, seconds: frames / 60 };
  };
  // what the search ranks by, made now; the rest the first time a row that ships reads it
  const variantTotal = (i: number, v: number): number => {
    const whole: number[] = [], wholeOrder: number[] = [];
    for (let sec = 0; sec < complete; sec++) {
      const s = secs[sec]!, delta = s.deltaBy[i]!;
      for (const k of s.order) {
        if (whole[k] === undefined) {
          whole[k] = 0;
          wholeOrder.push(k);
        }
        whole[k] = whole[k]! + (s.by[k]! + delta[v * stride + k]!);
      }
    }
    let total = 0;
    for (const k of wholeOrder) total += adjusted(whole[k]!, frames);
    return total;
  };
  return {
    ...figures(-1, -1),
    variantRuns: src.map((own, i) => own.map((_, v) => new VariantFigures(variantTotal(i, v), frames / 60, unsafe(i, v), () => figures(i, v)))),
  };
}

type VariantDetail = Pick<VariantRun, "bySlot" | "sectionTotals" | "sectionBySlot" | "fightTotal" | "fightBySlot">;
/** One variant's `VariantRun`, its breakdown built on first read (`sumHits`). */
class VariantFigures implements VariantRun {
  private made: VariantDetail | null = null;
  constructor(public total: number, public seconds: number, public unsafe: boolean, private readonly make: () => VariantDetail) {}
  private get detail(): VariantDetail { return (this.made ??= this.make()); }
  get bySlot(): Map<string, number> { return this.detail.bySlot; }
  get sectionTotals(): number[] { return this.detail.sectionTotals; }
  get sectionBySlot(): Map<string, number>[] { return this.detail.sectionBySlot; }
  get fightTotal(): number { return this.detail.fightTotal; }
  get fightBySlot(): Map<string, number> { return this.detail.fightBySlot; }
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

/** Per loadout and build, the least any team has measured it to need: the opening guess for a team
 *  not run yet. The least, since a guess too high costs a whole re-run and one too low only the part
 *  of a run up to the Liberation it can't fill. */
const ER_PRIOR = new WeakMap<Loadout, Map<string, number>>();

/** Per loadout, the constant ER a combo's own gear adds up to, by combo and then ER rolls — the same
 *  pieces recur across a team's combos, so this is read far more often than it is filled. */
const ER_HELD = new WeakMap<Loadout, Map<string, number[]>>();

/** The opening guess for a combo not yet run. No probe run: a team opens on the tier each kit
 *  named and the first run of it measures what was really needed (`runTeam`), which both corrects
 *  that run and becomes the guess every combo after starts from. */
export function erNeedFor(teamKey: string, members: Member[], combo: Combo[]): number[] {
  const last = ER_LAST.get(teamKey), seen = ER_SEEN.get(teamKey);
  return members.map((m, i) => seen?.[i]?.get(combo[i]!.build) ?? last?.[i] ?? ER_PRIOR.get(m.loadout)?.get(combo[i]!.build) ?? 0);
}

/** Bank what a run of `combo` measured (or, with `member`, what one cast of theirs asked for). */
function remember(teamKey: string, members: Member[], combo: Combo[], need: number[], member = -1): void {
  ER_LAST.set(teamKey, need);
  let seen = ER_SEEN.get(teamKey);
  if (!seen) {
    seen = combo.map(() => new Map());
    ER_SEEN.set(teamKey, seen);
  }
  need.forEach((n, i) => {
    if (member >= 0 && member !== i) return;
    seen![i]!.set(combo[i]!.build, n);
    let prior = ER_PRIOR.get(members[i]!.loadout);
    if (!prior) ER_PRIOR.set(members[i]!.loadout, prior = new Map());
    const was = prior.get(combo[i]!.build);
    if (was === undefined || n < was) prior.set(combo[i]!.build, n);
  });
}

/** What each member's own gear, this combo's picks included, already pays towards that. */
function erHeld(m: Member, c: Combo, rolls: number): number {
  let per = ER_HELD.get(m.loadout);
  if (!per) {
    per = new Map();
    ER_HELD.set(m.loadout, per);
  }
  let byRolls = per.get(c.key);
  if (!byRolls) per.set(c.key, (byRolls = []));
  const hit = byRolls[rolls];
  if (hit !== undefined) return hit;
  // constant stats are one piece's own, so the pieces' ER sums — and each is priced once (`gearEr`)
  let held = 0;
  for (const g of m.loadout.pieces(c.weapon, c.echo, c.mainstat, c.sequence, c.matrix !== null, c.highSubs, rolls)) held += gearEr(g);
  byRolls[rolls] = held;
  return held;
}

/** How many ER rolls each member's spread has to carry under this combo. Can come back higher than
 *  any spread can pay — `shortOf` is what tests that, and the solver drops those combos rather
 *  than the team, since a sonata or mainslot carrying ER often covers what the rotation needs. */
export function erRollsFor(teamKey: string, members: Member[], combo: Combo[]): number[] {
  const need = ER_NEED_AT.get(needKey(teamKey, combo)) ?? erNeedFor(teamKey, members, combo);
  return members.map((m, i) => erRollsWanted(m, combo[i]!, need[i] ?? 0));
}

/** One member's ER rolls under one combo, given the requirement `need` — or the kit's own minimum
 *  (`Loadout.minEr`), where that is the higher — each priced at the spread the combo wears. */
function erRollsWanted(m: Member, c: Combo, need: number): number {
  const base = (c.highSubs ? m.loadout.highSubstat : m.loadout.substat).tiers[0]!.rolls;
  need = Math.max(need, m.loadout.minEr);
  if (!need) return base;
  return base + Math.max(0, Math.ceil((need - erHeld(m, c, base) - ER_TOLERANCE) / erRollValue(c.highSubs)));
}

/** How much constant ER one piece carries — the mainstat sweep compares two picks by this rather
 *  than pricing a whole combo for each. Per Buff, so it is computed once for the whole solve. */
const GEAR_ER = new WeakMap<Gear, number>();
export function gearEr(gear: Gear): number {
  let er = GEAR_ER.get(gear);
  if (er === undefined) {
    er = menuStats([gear]).reduce((n, e) => n + (e.stat === Stat.ER ? e.value : 0), 0);
    GEAR_ER.set(gear, er);
  }
  return er;
}

/** Per loadout and combo, the Crit Rate its pieces show on the character screen at each ER tier. */
const CR_HELD = new WeakMap<Loadout, Map<string, number[]>>();
function crHeld(m: Member, c: Combo, rolls: number): number {
  let per = CR_HELD.get(m.loadout);
  if (!per) CR_HELD.set(m.loadout, (per = new Map()));
  let byRolls = per.get(c.key);
  if (!byRolls) per.set(c.key, (byRolls = []));
  const hit = byRolls[rolls];
  if (hit !== undefined) return hit;
  const held = menuStats(m.loadout.pieces(c.weapon, c.echo, c.mainstat, c.sequence, c.matrix !== null, c.highSubs, rolls))
    .reduce((n, e) => n + (e.stat === Stat.CritRate ? e.value : 0), 0);
  byRolls[rolls] = held;
  return held;
}

/** What keeps each member off this combo, or null: "er" where the ER it asks for (the bar's, or
 *  the kit's `minEr`) is past what a spread carries, "cr" where the character screen's Crit Rate
 *  is under the kit's `minCritRate`. */
export function shortOf(teamKey: string, members: Member[], combo: Combo[]): ("er" | "cr" | null)[] {
  const rolls = erRollsFor(teamKey, members, combo);
  return members.map((m, i) => {
    const l = m.loadout;
    const { tiers } = combo[i]!.highSubs ? l.highSubstat : l.substat;
    if (rolls[i]! > tiers[tiers.length - 1]!.rolls) return "er";
    if (l.minCritRate && crHeld(m, combo[i]!, rolls[i]!) < l.minCritRate) return "cr";
    return null;
  });
}

/** What each member's Liberation actually needed over this run — the same solve `erNeedFor` does,
 *  read off the slots the run left behind rather than off a probe. Independent of the ER the build
 *  was wearing: the constant it ran at comes back out of the buffed term. */
function measureNeed(members: Member[], _combo: Combo[], state: State): number[] {
  return members.map((m, i) => (m.loadout.resonator.maxEnergy ? state.slots[i]!.erWorst : 0));
}

/** What `alt` wears in place of `c`'s pieces: the same build but for constant-stat pieces (a main
 *  stat, an echo set's 2pc), which is what lets one run score it as a variant of the other. */
function swapsOf(c: Combo, alt: Combo): PieceSwap[] {
  const from = [...c.echo.pieces(), c.mainstat], to = [...alt.echo.pieces(), alt.mainstat];
  const same = from.length === to.length && c.weapon === alt.weapon && c.sequence === alt.sequence && c.matrix === alt.matrix && c.highSubs === alt.highSubs;
  const swaps: PieceSwap[] = [];
  for (let k = 0; same && k < from.length; k++) {
    if (from[k] === to[k]) continue;
    if (!from[k]!.constantOnly || !to[k]!.constantOnly) break;
    swaps.push([from[k]!, to[k]!]);
  }
  if (!same || swaps.length !== from.filter((g, k) => g !== to[k]).length) throw new Error(`teamrun.ts: ${alt.key} is no constant-stat variant of ${c.key}`);
  return swaps;
}

/** `combo` with member `i`'s replaced by `alt` — the combo one of their variants stands for. */
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
    // is nothing left to climb to, so the run finishes short, which is what `shortOf` reports.
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
        remember(teamKey, members, combo, raised, at);
        if (known) ER_NEED_AT.set(key, raised);
        floor[at] = erRollsFor(teamKey, members, combo)[at]!;
        continue;
      }
      // a run that finished tells us what it really needed, so every combo after starts from there
      const measured = run.state ? measureNeed(members, combo, run.state) : null;
      if (run.base) run.base.measured = measured;
      if (measured && !known) {
        ER_NEED_AT.set(key, measured);
        remember(teamKey, members, combo, measured);
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

/**
 * The run `combo` would get, read off `from`'s fight instead of fought again — every member on
 * `from`'s own pick or on one of the builds it carried as variants, where a constant-stat piece only
 * ever changes its wearer's figures. Only where that run would be `from`'s very fight: every variant
 * leaned on one the engine vouched for (its rows re-run dry where a hook read what it moves), every
 * member wearing the substat piece `from`'s rows wore, and no Liberation of `from`'s asking more than
 * a member moving gear ER would wear (a run there gives up and climbs; a constant ER shift moves no
 * ask). The ER bookkeeping such a run makes is made here as `runTeam` makes it, so what comes after
 * reads the same.
 * `variants`: what the run would carry, as `runTeam` takes them. Null where it must be fought — after
 * the bookkeeping of a first attempt that would be run again lower, which `runTeam` then picks up.
 */
export function deriveRun(teamKey: string, members: Member[], combo: Combo[], from: TeamRun, variants: (Combo[] | null)[] | null): TeamRun | null {
  const b = from.base;
  if (!b || !b.measured) return null;
  // each member on `from`'s own pick (-1), else the variant it carried for this one
  const pick: number[] = [];
  for (let j = 0; j < members.length; j++) {
    const c = combo[j]!;
    if (c.key === from.combo[j]!.key) {
      pick.push(-1);
      continue;
    }
    const v = b.alts[j]?.findIndex((a) => a.key === c.key) ?? -1;
    if (v < 0 || b.engineUnsafe[j]![v]) return null;
    pick.push(v);
  }
  // the substat piece a row of `from` wore: its own build's, or a variant's own
  const rowPiece = (j: number, v: number): Gear => {
    const l = members[j]!.loadout, c = from.combo[j]!;
    return v < 0 || c.highSubs ? l.spread(c.highSubs, b.worn[j]!) : l.substat.at(b.rolls[j]![v]!);
  };
  // the first attempt wears what the requirement known now asks, as `runTeam`'s does
  const key = needKey(teamKey, combo);
  const known = ER_NEED_AT.has(key);
  const worn = erRollsFor(teamKey, members, combo);
  for (let j = 0; j < members.length; j++) {
    if (members[j]!.loadout.spread(combo[j]!.highSubs, worn[j]!) !== rowPiece(j, pick[j]!)) return null;
  }
  // a piece moving gear ER moves the constant each Liberation is held to: where one of `from`'s asks
  // (unmoved by a constant shift) is past it, a real run would give up (ER_SHORT), so it is fought
  for (let j = 0; j < members.length; j++) {
    const m = members[j]!, c = combo[j]!;
    if (pick[j]! < 0 || c.highSubs) continue;
    const held = erHeld(m, c, worn[j]!);
    if (held === erHeld(m, from.combo[j]!, worn[j]!)) continue;
    if (worn[j]! >= m.loadout.substat.tiers[m.loadout.substat.tiers.length - 1]!.rolls) continue;
    if (b.wants[j]!.some((w) => w > held + ER_TOLERANCE + 1e-9)) return null;
  }
  // ...and its variants the rolls `runTeamInner` hands them, off the same rows of `from`
  const source: number[][] = [];
  const variantRolls: number[][] = [];
  if (variants) {
    const own = ER_NEED_AT.get(key) ?? erNeedFor(teamKey, members, combo);
    for (let i = 0; i < members.length; i++) {
      const m = members[i]!, alts = variants[i] ?? [];
      source.push([]);
      variantRolls.push([]);
      for (const alt of alts) {
        const rolls = erRollsWanted(m, alt, (ER_NEED_AT.get(needKey(teamKey, variantCombo(combo, i, alt))) ?? own)[i] ?? 0);
        const src = alt.key === from.combo[i]!.key ? -1 : b.alts[i]?.findIndex((a) => a.key === alt.key) ?? -1;
        if (src < 0 && alt.key !== from.combo[i]!.key) return null;
        const piece = combo[i]!.highSubs ? m.loadout.spread(true, worn[i]!) : m.loadout.substat.at(rolls);
        if (piece !== rowPiece(i, src)) return null;
        source[i]!.push(src);
        variantRolls[i]!.push(rolls);
      }
    }
  }
  // the attempt has finished: what it measured is `from`'s, the same fight on the same pieces
  const measured = b.measured;
  if (!known) {
    ER_NEED_AT.set(key, measured);
    remember(teamKey, members, combo, measured);
  }
  const asked = erRollsFor(teamKey, members, combo);
  if (members.some((m, i) => !combo[i]!.highSubs && m.loadout.substat.at(asked[i]!) !== m.loadout.substat.at(worn[i]!))) return null;

  const avgAt = (h: HitRecord, j: number | undefined): number => (j !== undefined && pick[j]! >= 0 ? h.variantAvg![pick[j]!]! : h.avg);
  // judged as `runTeam` judges a variant after the run: the engine's verdict on the rows it reads,
  // and the tier its own combo asks for against the one it wore
  const unsafe = members.map((m, i) => (variants?.[i] ?? []).map((alt, v) => {
    const at = variantCombo(combo, i, alt);
    const altKey = needKey(teamKey, at);
    if (!ER_NEED_AT.has(altKey)) ER_NEED_AT.set(altKey, measured);
    const askedAlt = erRollsFor(teamKey, members, at)[i]!;
    const src = source[i]![v]!;
    return (src >= 0 && b.engineUnsafe[i]![src]!) || (!alt.highSubs && m.loadout.substat.at(askedAlt) !== m.loadout.substat.at(variantRolls[i]![v]!));
  }));
  const { variantRuns, ...sums } = sumHits(b.hits, b.complete, b.frames, members, avgAt, members.map((_, i) => (variants?.[i]?.length ? source[i]! : [])),
    (i, v) => unsafe[i]![v]!, true);
  return {
    state: from.state, teamKey, members, combo, rotationLines: null, ...sums, sectionSeconds: from.sectionSeconds, variantRuns,
  };
}

function runTeamInner(teamKey: string, members: Member[], combo: Combo[], trace: boolean, variants: (Combo[] | null)[] | null, erRolls = erRollsFor(teamKey, members, combo), guard: boolean[] = [], replay = false): TeamRun {
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
      slot.variantAt = new Map();
      slot.variantUnsafe = alts.map(() => false);
      // a piece carrying ER moves the tier the spread wears, so each variant's base swaps the
      // substat piece along with its own — at the rolls the requirement known so far asks.
      // A variant has this build's buffs and so its need: where its own combo is not yet known,
      // this one's measurement is the guess, ahead of the team's
      const worn = c.highSubs ? null : m.loadout.substat.at(erRolls[i]!);
      const own = ER_NEED_AT.get(needKey(teamKey, combo)) ?? erNeedFor(teamKey, members, combo);
      slot.variantRolls = alts.map((alt) => erRollsWanted(m, alt, (ER_NEED_AT.get(needKey(teamKey, variantCombo(combo, i, alt))) ?? own)[i] ?? 0));
      slot.variants = alts.map((alt, v) => {
        const swaps = swapsOf(c, alt), piece = c.highSubs ? null : m.loadout.substat.at(slot.variantRolls[v]!);
        return piece === worn ? swaps : [...swaps, [worn!, piece!] as const];
      });
    }
  });
  state.active = 0;
  // the enemy is equipped like a member: the Tune Break resonator fires the break itself (tunebreak.ts)
  withTeam(state, () => equipEnemy(TUNE_BREAK_ENEMY));

  // one continuous fight of four rotations, whatever the team, the opener the first of them
  const { sections, starts, end: frames, blind } = runRotations(state, members.map((m, i) => m.loadout.rotationAt(combo[i]!.sequence)), 4);
  // a handoff that went blind is played again, every visit's successor known by now
  if (blind && !replay) return runTeamInner(teamKey, members, combo, trace, variants, erRolls, guard, true);
  if (trace) settleGauges(sections.flat() as ResolvedSnapshot[]);
  const complete = sections.length;
  // the report's lines, which only a traced run hands back
  const rotationLines = trace ? sections.map(toLines) : null;
  const sectionSeconds = starts.map((at, k) => ((starts[k + 1] ?? frames) - at) / 60);

  // a rotation's damage is the hits landing inside its frames, swap to swap, whatever row shows them
  const hits: HitRecord[][] = starts.map(() => []);
  for (const h of state.hits) {
    if (h.at > frames) continue;
    let k = 0;
    while (k + 1 < starts.length && h.at >= starts[k + 1]!) k++;
    hits[k]!.push(h);
  }
  const { total, bySlot, sectionTotals, sectionBySlot, fightTotal, fightBySlot, seconds, variantRuns } = sumHits(hits, complete, frames, members,
    (h) => h.avg, members.map((_, i) => (variants?.[i] ?? []).map((_, v) => v)), (i, v) => state.slots[i]!.variantUnsafe[v]!, false);
  const base: VariantBase | undefined = variants ? {
    hits, complete, frames, worn: erRolls.slice(), alts: variants, measured: null, wants: state.slots.map((s) => s.erWants),
    rolls: state.slots.map((s, i) => (variants[i]?.length ? s.variantRolls.slice() : [])),
    engineUnsafe: state.slots.map((s, i) => (variants[i]?.length ? s.variantUnsafe.slice() : [])),
  } : undefined;

  // a traced run's results are the full snapshots (see `Result`), which the report's own folds read
  return {
    state, teamKey, members, combo, rotationLines: rotationLines && collapseFields(rotationLines as ChainGroup[][]),
    total, bySlot, sectionTotals, sectionBySlot, fightTotal, fightBySlot, seconds, sectionSeconds, variantRuns, base,
  };
}

/** A row's figures as plain data a worker can post back: `TeamRun`'s own, Maps as entries. */
export interface RowScore {
  total: number; bySlot: [string, number][]; sectionTotals: number[]; sectionBySlot: [string, number][][];
  fightTotal?: number; fightBySlot?: [string, number][]; seconds?: number; sectionSeconds?: number[];
}

export const scoreOf = (run: TeamRun): RowScore => ({
  total: run.total, bySlot: [...run.bySlot], sectionTotals: run.sectionTotals, sectionBySlot: run.sectionBySlot.map((by) => [...by]),
  fightTotal: run.fightTotal, fightBySlot: [...run.fightBySlot], seconds: run.seconds, sectionSeconds: run.sectionSeconds,
});

export const runFromScore = (teamKey: string, members: Member[], combo: Combo[], score: RowScore): TeamRun => ({
  state: null, teamKey, members, combo, rotationLines: null, variantRuns: [],
  total: score.total, bySlot: new Map(score.bySlot), sectionTotals: score.sectionTotals,
  sectionBySlot: score.sectionBySlot.map((by) => new Map(by)),
  // a score saved before the whole-fight figures carries none: read back off the adjusted ones
  fightTotal: score.fightTotal ?? (score.total * 120) / 26,
  fightBySlot: new Map(score.fightBySlot ?? score.bySlot.map(([slot, v]): [string, number] => [slot, (v * 120) / 26])),
  // a score saved before it: the time the sections took, off their damage and its rate
  seconds: score.seconds ?? (score.sectionTotals.reduce((a, b) => a + b, 0) * 26) / Math.max(1, score.total),
  // a score saved before it: each rotation the average of the time they took
  sectionSeconds: score.sectionSeconds ?? score.sectionTotals.map(() => (score.seconds ?? 0) / Math.max(1, score.sectionTotals.length)),
});
