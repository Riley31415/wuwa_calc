/**
 * teamrun.ts over the WebAssembly engine: one run of a team under one combo, and the lines/totals
 * the page reads off it. The ER-tier loop and its caches live in the engine; this side only asks.
 */
import { Stat } from "../engine/stats.js";
import type { Type, ActionTag } from "../engine/stats.js";
import { call } from "../engine/wasm.js";
import { addGear, gearById } from "./gear.js";
import type { Gear, GearJson } from "./gear.js";
import { addAction, actionById } from "./rotation.js";
import type { ActionField, ActionJson } from "./rotation.js";
import { foldStat } from "./damage.js";
import type { ChainGroup, Result, ResolvedSnapshot } from "./evaluate.js";
import type { State } from "./state.js";
import type { Report } from "../display.js";
import type { Member, Combo } from "../solver.js";

export interface TeamRun {
  /** What a traced run leaves for the loadout hovers — null on an untraced or rebuilt row. */
  state: State | null;
  teamKey: string;
  members: Member[];
  combo: Combo[];
  /** [opener, loop 1, loop 2, loop 3] — only kept on a traced run. */
  rotationLines: ChainGroup[][] | null;
  total: number;
  bySlot: Map<string, number>;
  sectionTotals: number[];
  sectionBySlot: Map<string, number>[];
  fightTotal: number;
  fightBySlot: Map<string, number>;
  seconds: number;
  sectionSeconds: number[];
  variantRuns: VariantRun[][];
  detail?: { report: Report };
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

/** A combo as the engine names it: indices into the member's loadout, off the combo's own key. */
interface Pick { weapon: number; echo: number; mainstat: number; sequence: number; refine: number; matrix: boolean; highSubs: boolean }
const pickOf = (c: Combo): Pick => {
  const [w, e, m, s, r, ...rest] = c.key.split(".");
  return { weapon: +w!, echo: +e!, mainstat: +m!, sequence: +s!.slice(1), refine: +r!.slice(1), matrix: rest.includes("m"), highSubs: rest.includes("h") };
};

type Slots = [string, number][];
interface VariantJson { total: number; bySlot: Slots; sectionTotals: number[]; sectionBySlot: Slots[]; fightTotal: number; fightBySlot: Slots; seconds: number; unsafe: boolean }
interface RunJson {
  total: number; bySlot: Slots; sectionTotals: number[]; sectionBySlot: Slots[]; fightTotal: number; fightBySlot: Slots;
  seconds: number; sectionSeconds: number[]; variantRuns: VariantJson[][]; erWorst: number[]; traced?: TracedJson;
}
interface RowJson {
  action: number; member: string; slot: string; triggered: boolean; mv: number; avg: number; starts: number; ends: number;
  hitAt: number | null; swapFrames: number | null; queued: boolean; variantAvg: number[] | null;
  source: { name: string; source: string; left: number } | null;
  trace?: {
    entries: [number, number, string, string, number | null][]; castAdds: { source: string; owner: string; gains: number[] }[];
    type: Type | null; stats: number[]; forte: number[]; forteBefore: number[]; maxForte: number[];
    energy: number; concerto: number; offtune: number; energyBefore: number; concertoBefore: number; offtuneBefore: number;
    concertoShort: boolean; forteShort: boolean[]; energyWiped: boolean; realEnergyBefore: number;
    frame: number; frames: number; tag: ActionTag; active: boolean; timestopBanked: number;
    heldLocal: { name: string; source: string; left: number }[]; heldGlobal: { name: string; source: string; left: number }[]; heldEnemy: { name: string; source: string; left: number }[];
    opensFields: string[]; castGain: number[] | null;
  };
}
interface LineJson { id: string; isChain: boolean; members: number[]; parts: number[]; snap: number; mv: number; avg: number; spill: boolean; aggregate: boolean; fieldKey: string | null }
interface TracedJson { rows: RowJson[]; lines: LineJson[][]; actions: ActionJson[]; gears: GearJson[]; grantedBy: [number, number][]; grantedOn: [number, string][] }

const slots = (s: Slots): Map<string, number> => new Map(s);
const variantOf = (v: VariantJson): VariantRun => ({
  total: v.total, bySlot: slots(v.bySlot), sectionTotals: v.sectionTotals, sectionBySlot: v.sectionBySlot.map(slots),
  fightTotal: v.fightTotal, fightBySlot: slots(v.fightBySlot), seconds: v.seconds, unsafe: v.unsafe,
});

/** A traced row as the report reads it: evaluate.ts's ResolvedSnapshot. */
function snapshotOf(r: RowJson, fields: Map<string, ActionField>): ResolvedSnapshot {
  const t = r.trace!;
  const stats = t.stats;
  const snap: ResolvedSnapshot = {
    action: actionById(r.action), member: r.member, slot: r.slot, triggered: r.triggered, source: r.source, queued: r.queued,
    variantAvg: r.variantAvg, mv: r.mv, avg: r.avg, starts: r.starts, ends: r.ends, castGain: t.castGain,
    stat: (k) => stats[k]!, stats,
    atk: foldStat(stats, Stat.BaseAtk, Stat.BonusAtk, Stat.FlatAtk),
    hp: foldStat(stats, Stat.BaseHp, Stat.BonusHp, Stat.FlatHp),
    def: foldStat(stats, Stat.BaseDef, Stat.BonusDef, Stat.FlatDef),
    amp: stats[Stat.Amp]!, dmgBonus: stats[Stat.DmgBonus]!,
    subtypeAmp: stats[37]!, subtypeCritRate: stats[39]!, subtypeCritDmg: stats[40]!, subtypeTotalDmg: stats[41]!, subtypeDamageTaken: stats[42]!,
    enemyRes: 0, enemyDef: 792 + 8 * 100,
    entries: t.entries.map(([stat, value, source, owner, gear]) => ({ stat, value, source, owner, gear: gear === null ? null : gearById(gear) })),
    castAdds: t.castAdds,
    type: t.type,
    forte: t.forte as ResolvedSnapshot["forte"], forteBefore: t.forteBefore as ResolvedSnapshot["forte"], maxForte: t.maxForte as ResolvedSnapshot["forte"],
    energy: t.energy, concerto: t.concerto, offtune: t.offtune,
    energyBefore: t.energyBefore, concertoBefore: t.concertoBefore, offtuneBefore: t.offtuneBefore,
    concertoShort: t.concertoShort, forteShort: t.forteShort as ResolvedSnapshot["forteShort"], energyWiped: t.energyWiped,
    realEnergyBefore: t.realEnergyBefore,
    frame: t.frame, frames: t.frames, tag: t.tag, active: t.active, timestopBanked: t.timestopBanked,
    heldLocal: t.heldLocal, heldGlobal: t.heldGlobal, heldEnemy: t.heldEnemy,
    opensFields: t.opensFields.map((f) => fields.get(f) ?? (fields.set(f, { name: f }), fields.get(f)!)),
  };
  if (r.hitAt !== null) snap.hitAt = r.hitAt;
  if (r.swapFrames !== null) snap.swapFrames = r.swapFrames;
  return snap;
}

/** The traced run's lines, every snapshot one object however many lines name it. */
function linesOf(tr: TracedJson): { lines: ChainGroup[][]; state: State } {
  for (const g of tr.gears) addGear(g);
  for (const a of tr.actions) addAction(a);
  const fields = new Map<string, ActionField>();
  // the mirrored actions' own fields, so a hit's field and the opening's are one object
  for (const a of tr.actions) {
    const field = actionById(a.id).field;
    if (field) fields.set(field.name, field);
  }
  const snaps = new Map<number, ResolvedSnapshot>();
  const snap = (i: number): ResolvedSnapshot => {
    let s = snaps.get(i);
    if (!s) snaps.set(i, (s = snapshotOf(tr.rows[i]!, fields)));
    return s;
  };
  const lines = tr.lines.map((sec) => sec.map((l): ChainGroup => {
    const line: ChainGroup = {
      id: l.id, isChain: l.isChain, snap: snap(l.snap), mv: l.mv, avg: l.avg,
      parts: l.parts.map((p) => ({ snap: snap(p), dmg: { avg: snap(p).avg } })),
      spill: l.spill,
    };
    if (l.members.length) line.members = l.members.map(snap);
    if (l.aggregate) line.aggregate = true;
    if (l.fieldKey !== null) line.fieldKey = l.fieldKey;
    return line;
  }));
  const state: State = {
    grantedBy: new Map(tr.grantedBy.map(([k, v]) => [gearById(k), gearById(v)] as [Gear, Gear])),
    grantedOn: new Map(tr.grantedOn.map(([k, v]) => [gearById(k), v] as [Gear, string])),
  };
  return { lines, state };
}

/** @param trace  keep the report's lines (the detail page); off for the bulk pass.
 *  @param variants  per member, combos differing from `combo` in that member's main stat alone. */
export function runTeam(teamKey: string, members: Member[], combo: Combo[], trace = false, variants: (Combo[] | null)[] | null = null): TeamRun {
  const reply = call<RunJson>({
    op: "runTeam", team: teamKey, members: members.map((m) => m.loadout.export), combo: combo.map(pickOf), trace,
    variants: variants && variants.map((alts) => alts && alts.map(pickOf)),
  });
  const traced = reply.traced ? linesOf(reply.traced) : null;
  return {
    state: traced ? traced.state : null, teamKey, members, combo, rotationLines: traced ? traced.lines : null,
    total: reply.total, bySlot: slots(reply.bySlot), sectionTotals: reply.sectionTotals, sectionBySlot: reply.sectionBySlot.map(slots),
    fightTotal: reply.fightTotal, fightBySlot: slots(reply.fightBySlot), seconds: reply.seconds, sectionSeconds: reply.sectionSeconds,
    variantRuns: reply.variantRuns.map((vs) => vs.map(variantOf)),
  };
}

/** How many ER rolls each member's spread carries under this combo (the engine's caches). */
export function erRollsFor(teamKey: string, members: Member[], combo: Combo[]): number[] {
  return call<number[]>({ op: "erRollsFor", team: teamKey, members: members.map((m) => m.loadout.export), combo: combo.map(pickOf) });
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
  fightTotal: score.fightTotal ?? (score.total * 120) / 26,
  fightBySlot: new Map(score.fightBySlot ?? score.bySlot.map(([slot, v]): [string, number] => [slot, (v * 120) / 26])),
  seconds: score.seconds ?? (score.sectionTotals.reduce((a, b) => a + b, 0) * 26) / Math.max(1, score.total),
  sectionSeconds: score.sectionSeconds ?? score.sectionTotals.map(() => (score.seconds ?? 0) / Math.max(1, score.sectionTotals.length)),
});
