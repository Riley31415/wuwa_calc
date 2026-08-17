/**
 * Demo runner: evaluates Jingran's opener and prints the per-action breakdown.
 *
 *   node dist/src/run.js
 *   node dist/src/run.js --entries      also list every buff contribution per action
 *
 * (tsc compiles into dist/, mirroring this file's own path one level deeper — run `npm run
 * build` first if dist/ is stale.)
 */
import { collapseChains } from "./kit.js";
import type { ChainGroup } from "./kit.js";
import { State, Enemy } from "./state.js";
import type { RotationEntry, ResolvedSnapshot } from "./state.js";
import { damage, RESONATOR_LEVEL } from "./damage.js";
import { buildReport, renderReport, explain } from "./display.js";
import { AUTO_TUNE_BREAK } from "./shared/tunebreak.js";
import { LOADOUT, ROTATION } from "./resonators/jingran.js";
import { Element, ELEMENTS } from "./stats.js";

// level 100 enemy, a flat 20% base resistance, 39.2% max off-tune — every fight this calculator
// runs uses the same standing numbers (resonator level is RESONATOR_LEVEL, from damage.js).
const ENEMY_LEVEL = 100, DEFAULT_RES = 20, MAX_OFFTUNE = 392000;

export function runJingran(rotation: RotationEntry[] = ROTATION) {
  // the same flat resistance seeded onto every element, until a fight wants them to differ
  const enemy = new Enemy({
    level: ENEMY_LEVEL,
    baseRes: Object.fromEntries(ELEMENTS.map((e) => [e, DEFAULT_RES])),
    maxOfftune: MAX_OFFTUNE,
  });
  const state = new State({
    team: ["Jingran"],
    enemy,
    // the engine's own standing rules, ahead of anything a build equips
    buffs: [AUTO_TUNE_BREAK],
  });
  state.startFight({ Jingran: LOADOUT });

  const rows = state.run(rotation)
    .map((s) => ({ snap: s, dmg: damage(s) }));
  return { state, rows, lines: collapseChains(rows) };
}

function main(): void {
  const showEntries = process.argv.includes("--entries");
  const { state, rows, lines } = runJingran();

  const report = buildReport(lines);

  console.log(`Jingran — ${lines.length} steps / ${rows.length} actions, `
    + `level ${RESONATOR_LEVEL} vs level ${state.enemy.level}, `
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
