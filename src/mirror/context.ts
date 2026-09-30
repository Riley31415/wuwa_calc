/** context.ts's menuStats: a loadout's gear read cold, every constant stat line it adds. */
import type { StatKey } from "../engine/stats.js";
import type { Gear } from "./gear.js";
import type { StatEntry } from "./state.js";

/** Every constant line of `gear`, each piece's in order, one entry per piece and stat key. */
export function menuStats(gear: Gear[]): StatEntry[] {
  const seen = new Set<string>();
  const out: StatEntry[] = [];
  for (const g of gear) {
    for (const [stat, value, tag] of g.lines) {
      const key: StatKey = tag === undefined ? stat : stat | tag;
      const dedupe = `${g.name} ${key}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push({ stat: key, value, source: g.name, owner: "", gear: g });
    }
  }
  return out;
}
