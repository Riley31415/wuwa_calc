/**
 * Demo runner: evaluates Jingran's opener and prints the per-action breakdown.
 *
 *   node dist/src/run.js
 *   node dist/src/run.js --entries      also list every buff contribution per action
 *
 * (tsc compiles into dist/, mirroring this file's own path one level deeper — run `npm run
 * build` first if dist/ is stale.)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { collapseChains } from "./kit.js";
import type { ChainGroup } from "./kit.js";
import { State, Enemy } from "./state.js";
import type { RotationEntry, ResolvedSnapshot } from "./state.js";
import { damage } from "./damage.js";
import { buildReport, renderReport, explain } from "./display.js";
import { AUTO_TUNE_BREAK } from "./shared/tunebreak.js";
import { LOADOUT, ROTATION } from "./resonators/jingran.js";
import { Element, ELEMENTS } from "./stats.js";

const HERE = dirname(fileURLToPath(import.meta.url));
// one ".." further than data/'s real depth from this file's own source location — dist/src/
// sits one level deeper than src/ does, since dist/ mirrors the whole project under itself
const dataFile = (n: string): any => JSON.parse(readFileSync(join(HERE, "..", "..", "data", n), "utf8"));

export function runJingran(rotation: RotationEntry[] = ROTATION) {
  const cfg = dataFile("config.json").constants;

  // the same flat resistance seeded onto every element, until a fight wants them to differ
  const enemy = new Enemy({
    level: cfg.enemyLevel,
    baseRes: Object.fromEntries(ELEMENTS.map((e) => [e, cfg.defaultRes * 100])),
    maxOfftune: cfg.maxOfftune,
  });
  const state = new State({
    team: ["Jingran"],
    level: cfg.resonatorLevel,
    enemy,
    // the engine's own standing rules, ahead of anything a build equips
    buffs: [AUTO_TUNE_BREAK],
  });
  state.startFight({ Jingran: LOADOUT });

  const rows = state.run(rotation)
    .map((s) => ({ snap: s, dmg: damage(s, state.config) }));
  return { state, rows, lines: collapseChains(rows) };
}

function main(): void {
  const showEntries = process.argv.includes("--entries");
  const { state, rows, lines } = runJingran();

  const report = buildReport(lines, { strip: /^Jingran: /, config: state.config });

  console.log(`Jingran — ${lines.length} steps / ${rows.length} actions, `
    + `level ${state.config.level} vs level ${state.enemy.level}, `
    + `${state.enemy.baseRes[Element.Physical] ?? 0}% res\n`);
  console.log(renderReport(report));

  if (showEntries) {
    console.log("\ncontributions per step");
    for (const row of report.rows) {
      console.log(`\n  ${row.raw.i}  ${row.raw.action}`);
      // ChainGroup.snap is typed as the plain damage.ts Snapshot, but every row here was built
      // from state.run()'s own resolved snapshots — explain() wants their `entries`.
      for (const { label, value } of explain(row.line.snap as ResolvedSnapshot)) {
        console.log(`      ${label.padEnd(58)}${value.toFixed(4).padStart(12)}`);
      }
    }
  }

  const fusionCount = state.slots.filter((s) => s.resonator?.element === Element.Fusion).length;
  console.log(`\nteam: fusion count ${fusionCount} · buffs held ${state.slots[0]!.list.size}`);
  if (state.log.length) {
    console.log(`\nbuff log (${state.log.length} events):\n  ${state.log.join("\n  ")}`);
  }
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) main();
