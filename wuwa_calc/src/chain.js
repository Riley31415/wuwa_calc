/**
 * Collapsing chain results for display.
 *
 * A chain is evaluated member by member — each part snapshots its own buffs and gets its own
 * damage — but reads as one line in the output. The collapsed row carries:
 *
 *   - the **total motion value** of every part combined
 *   - the **summed damage** of every part
 *   - the stats of whichever part hit hardest, since the parts may be of different types
 *     (BA1/BA2 are basic, BA3/BA4 are heavy) and no single set of stats describes them all
 *
 * Nothing here changes a calculation; it only groups results.
 */
import { mvPercent } from "./damage.js";

/**
 * @param rows  [{ snap, dmg }] in evaluation order, as returned alongside State.run()
 * @returns     [{ id, parts, snap, mv, noCrit, crit, avg, isChain }]
 */
export function collapseChains(rows) {
  const groups = [];
  const byInstance = new Map();

  for (const row of rows) {
    const instance = row.snap.chain;
    if (!instance) {
      groups.push({ id: row.snap.action.id, parts: [row], isChain: false });
      continue;
    }
    const existing = byInstance.get(instance);
    if (existing) {
      existing.parts.push(row);
    } else {
      const group = { id: row.snap.chainOf, parts: [row], isChain: true };
      byInstance.set(instance, group);
      groups.push(group);
    }
  }

  return groups.map((g) => {
    const best = g.parts.reduce((a, b) => (b.dmg.avg > a.dmg.avg ? b : a));
    const sum = (pick) => g.parts.reduce((n, p) => n + pick(p), 0);
    return {
      id: g.id,
      isChain: g.isChain,
      parts: g.parts,
      snap: best.snap,                       // the hardest-hitting part's stats
      mv: sum((p) => mvPercent(p.snap)),     // but the whole chain's motion value
      noCrit: sum((p) => p.dmg.noCrit),
      crit: sum((p) => p.dmg.crit),
      avg: sum((p) => p.dmg.avg),
    };
  });
}
