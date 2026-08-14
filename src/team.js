/**
 * The full team: Shorekeeper -> Iuno -> Jingran, each running their own rotation in slot
 * order. Shows every mechanism at once — the realm reaching the whole team through its outro
 * evolution, Iuno's amplification window handed to whoever intros next, and her shielding
 * feeding Jingran's Ghost Shroud live instead of the sheet's flat assumption.
 *
 *   node src/team.js
 *   node src/team.js --entries
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { collapseChains } from "./kit.js";
import { State } from "./state.js";
import { damage } from "./damage.js";
import { buildReport, renderReport, explain, totalsBySlot } from "./display.js";
import { AUTO_TUNE_BREAK, attributeMisc } from "./shared.js";

import * as LP from "./resonators/lupa.js";
import * as IO from "./resonators/iuno.js";
import * as JR from "./resonators/jingran.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const dataFile = (n) => JSON.parse(readFileSync(join(HERE, "..", "data", n), "utf8"));

// Lupa standing in for Shorekeeper, to test her kit against the rest of a real team.
const MEMBERS = [
  { name: "Lupa", loadout: LP.LOADOUT, rotation: LP.ROTATION },
  { name: "Iuno", loadout: IO.LOADOUT, rotation: IO.ROTATION },
  { name: "Jingran", loadout: JR.LOADOUT, rotation: JR.ROTATION },
];

export function runTeam() {
  const cfg = dataFile("config.json").constants;
  const levels = dataFile("levels.json");

  const state = new State({
    team: MEMBERS.map((m) => m.name),
    level: cfg.resonatorLevel,
    enemyLevel: cfg.enemyLevel,
    res: cfg.defaultRes * 100,
    // the engine's own standing rules, ahead of anything a build equips
    buffs: [AUTO_TUNE_BREAK],
  });
  state.config.maxOfftune = cfg.maxOfftune;
  state.startFight(Object.fromEntries(MEMBERS.map((m) => [m.name, m.loadout])));

  // One table for the whole team, in the order they act. Each rotation is still evaluated on
  // its own resonator; they are only concatenated for display, and no source prefix is
  // stripped, since with three resonators in one table the prefix is what tells them apart.
  const lines = MEMBERS.flatMap((m) => {
    const rows = state.run(m.rotation)
      .map((s) => ({ snap: attributeMisc(s), dmg: damage(s, state.config, levels) }));
    return collapseChains(rows);
  });

  return { state, lines, report: buildReport(lines, { config: state.config, levels }) };
}

function main() {
  const showEntries = process.argv.includes("--entries");
  const { state, report } = runTeam();
  const fmt = (n) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

  console.log(`Team: ${MEMBERS.map((m) => m.name).join(" -> ")}  `
    + `level ${state.config.level} vs level ${state.config.enemyLevel}, ${state.config.res}% res\n`);

  console.log(renderReport(report, { showParts: false }));

  if (showEntries) {
    for (const row of report.rows) {
      console.log(`\n  ${row.raw.i}  ${row.raw.action}`);
      for (const { label, value } of explain(row.line.snap)) {
        console.log(`      ${label.padEnd(58)}${value.toFixed(4).padStart(12)}`);
      }
    }
  }

  console.log("\n" + "-".repeat(40));
  for (const [name, total] of totalsBySlot(report)) {
    console.log(`${name.padEnd(14)}${fmt(total).padStart(14)}`);
  }
  console.log(`${"team total".padEnd(14)}${fmt(report.total).padStart(14)}`);
  // Every buff event, in order: gained, stacked, spent, lost. Behind `--log` because it is
  // long — the interesting handoffs are in there, but so is every stack of Ghost Shroud.
  if (process.argv.includes("--log")) {
    console.log(`\nbuff log (${state.log.length} events):`);
    for (const line of state.log) console.log(`  ${line}`);
  } else {
    console.log(`\nbuff log: ${state.log.length} events — rerun with --log to list them`);
  }
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) main();
