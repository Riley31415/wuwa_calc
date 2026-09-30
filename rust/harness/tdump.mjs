// node tdump.mjs <out> <team index | A,B,C> [picks json]: the traced run's lines and snapshots, as JSON
import { writeFileSync } from "node:fs";
import { team, tr } from "./members.mjs";
const [out, index, picksArg] = process.argv.slice(2);
const { key, members, combo } = await team(index, picksArg);
tr.runTeam(key, members, combo, false);
const run = tr.runTeam(key, members, combo, true);
const ids = new Map();
const snapOf = (s) => {
  if (!ids.has(s)) ids.set(s, ids.size);
  return ids.get(s);
};
const lines = run.rotationLines.map((sec) => sec.map((l) => ({
  id: l.id, isChain: l.isChain, mv: l.mv, avg: l.avg, spill: !!l.spill, aggregate: !!l.aggregate, fieldKey: l.fieldKey ?? null,
  snap: snapOf(l.snap), members: (l.members ?? []).map(snapOf), parts: l.parts.map((p) => snapOf(p.snap)),
})));
const snaps = [...ids.keys()].map((s) => ({
  action: s.action.name, member: s.member, slot: s.slot, triggered: s.triggered, mv: s.mv, avg: s.avg,
  starts: s.starts, ends: s.ends, hitAt: s.hitAt ?? null, swapFrames: s.swapFrames ?? null, queued: s.queued,
  source: s.source ? [s.source.name, s.source.source] : null, type: s.type, stats: s.stats,
  forte: s.forte, forteBefore: s.forteBefore, maxForte: s.maxForte, energy: s.energy, concerto: s.concerto, offtune: s.offtune,
  energyBefore: s.energyBefore, concertoBefore: s.concertoBefore, offtuneBefore: s.offtuneBefore,
  concertoShort: s.concertoShort, forteShort: s.forteShort, energyWiped: s.energyWiped, realEnergyBefore: s.realEnergyBefore,
  frame: s.frame, frames: s.frames, tag: s.tag, active: s.active, timestopBanked: s.timestopBanked,
  heldLocal: s.heldLocal.map((h) => [h.name, h.source, h.left]), heldGlobal: s.heldGlobal.map((h) => [h.name, h.source, h.left]), heldEnemy: s.heldEnemy.map((h) => [h.name, h.source, h.left]),
  opensFields: s.opensFields.map((f) => f.name), castGain: s.castGain,
  entries: s.entries.map((e) => [e.stat, e.value, e.source, e.owner]),
  castAdds: s.castAdds.map((c) => [c.source, c.owner, c.gains]),
}));
writeFileSync(out, JSON.stringify({ lines, snaps, grantedBy: [...run.state.grantedBy].map(([k, v]) => [k.name, v.name]), grantedOn: [...run.state.grantedOn].map(([k, v]) => [k.name, v]) }));
console.log(key, lines.flat().length, "lines", snaps.length, "snaps");
