/**
 * Demo runner: evaluates Jingran's opener and prints the per-action breakdown.
 *
 *   node engine/run.js
 *   node engine/run.js --entries      also list every buff contribution per action
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { State } from "./state.js";
import { damage } from "./damage.js";
import { collapseChains } from "./chain.js";
import { buildReport, renderReport, explain } from "./display.js";
import "./shared.js";
import { LOADOUT, ROTATION } from "./resonators/jingran.js";
import { COUNT_FUSION } from "./stats.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const dataFile = (n) => JSON.parse(readFileSync(join(HERE, "..", "data", n), "utf8"));

export function runJingran(rotation = ROTATION) {
  const cfg = dataFile("config.json").constants;
  const levels = dataFile("levels.json");

  const state = new State({
    team: ["Jingran"],
    level: cfg.resonatorLevel,
    enemyLevel: cfg.enemyLevel,
    res: cfg.defaultRes * 100,
  });
  state.config.maxOfftune = cfg.maxOfftune;
  state.startFight({ Jingran: LOADOUT });

  const rows = state.run(rotation)
    .map((s) => ({ snap: s, dmg: damage(s, state.config, levels) }));
  return { state, rows, levels, lines: collapseChains(rows) };
}

function main() {
  const showEntries = process.argv.includes("--entries");
  const { state, rows, levels, lines } = runJingran();

  const report = buildReport(lines, { strip: /^Jingran: /, config: state.config, levels });

  console.log(`Jingran — ${lines.length} steps / ${rows.length} actions, `
    + `level ${state.config.level} vs level ${state.config.enemyLevel}, `
    + `${state.config.res}% res\n`);
  console.log(renderReport(report));

  if (showEntries) {
    console.log("\ncontributions per step");
    for (const row of report.rows) {
      console.log(`\n  ${row.raw.i}  ${row.raw.action}`);
      for (const { label, value } of explain(row.line.snap)) {
        console.log(`      ${label.padEnd(58)}${value.toFixed(4).padStart(12)}`);
      }
    }
  }

  console.log(`\nteam: fusion count ${state.counter(COUNT_FUSION)} · `
    + `buffs held ${state.slots[0].list.size}`);
  if (state.log.length) console.log(`\nlog:\n  ${state.log.join("\n  ")}`);
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) main();
