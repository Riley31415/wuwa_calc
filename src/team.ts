/**
 * The full team: Shorekeeper -> Iuno -> Jingran, each running their own rotation in slot
 * order. Shows every mechanism at once — the realm reaching the whole team through its outro
 * evolution, Iuno's amplification window handed to whoever intros next, and her shielding
 * feeding Jingran's Ghost Shroud live instead of the sheet's flat assumption.
 *
 *   node dist/src/team.js
 *   node dist/src/team.js --entries
 *
 * (tsc compiles into dist/, mirroring this file's own path one level deeper — run `npm run
 * build` first if dist/ is stale.)
 */
import { collapseChains } from "./kit.js";
import type { ChainGroup } from "./kit.js";
import { State, Enemy } from "./state.js";
import type { Loadout, RotationEntry, ResolvedSnapshot } from "./state.js";
import { damage } from "./damage.js";
import { buildReport, renderReport, explain, totalsBySlot } from "./display.js";
import type { Report } from "./display.js";
import { AUTO_TUNE_BREAK, attributeMisc } from "./shared/tunebreak.js";
import { ELEMENTS, Element } from "./stats.js";

import * as LP from "./resonators/lupa.js";
import * as IO from "./resonators/iuno.js";
import * as JR from "./resonators/jingran.js";

// level 100 enemy, level 90 resonators, a flat 20% base resistance, 39.2% max off-tune — every
// fight this calculator runs uses the same standing numbers.
const ENEMY_LEVEL = 100, RESONATOR_LEVEL = 90, DEFAULT_RES = 20, MAX_OFFTUNE = 39.2;

interface Member {
  name: string;
  loadout: Loadout;
  opener: RotationEntry[];
  loop: RotationEntry[];
}

// Lupa standing in for Shorekeeper, to test her kit against the rest of a real team. Iuno and
// Jingran don't have a distinct opener written yet — stand in with their loop for now, so they
// still get a real turn during the opener phase instead of being skipped entirely.
const MEMBERS: Member[] = [
  { name: "Lupa", loadout: LP.LOADOUT, opener: LP.OPENER, loop: LP.LOOP },
  { name: "Iuno", loadout: IO.LOADOUT, opener: IO.ROTATION, loop: IO.ROTATION },
  { name: "Jingran", loadout: JR.LOADOUT_CRCD, opener: JR.ROTATION, loop: JR.ROTATION },
];

export function runTeam(): { state: State; lines: ChainGroup[]; report: Report } {
  // the same flat resistance seeded onto every element, until a fight wants them to differ
  const enemy = new Enemy({
    level: ENEMY_LEVEL,
    baseRes: Object.fromEntries(ELEMENTS.map((e) => [e, DEFAULT_RES])),
    maxOfftune: MAX_OFFTUNE,
  });
  const state = new State({
    team: MEMBERS.map((m) => m.name),
    level: RESONATOR_LEVEL,
    enemy,
    // the engine's own standing rules, ahead of anything a build equips
    buffs: [AUTO_TUNE_BREAK],
  });
  state.startFight(Object.fromEntries(MEMBERS.map((m) => [m.name, m.loadout])));

  // Every member's opener runs first, in team order, then every member's loop — matching how a
  // real run actually goes: the whole team gets set up before anyone starts repeating. Each
  // rotation is still evaluated on its own resonator; they are only concatenated for display,
  // and the "member" column is what tells them apart.
  const runPart = (rotation: RotationEntry[]): ChainGroup[] => {
    if (!rotation.length) return [];
    const rows = state.run(rotation)
      .map((s) => ({ snap: attributeMisc(s), dmg: damage(s, state.config) }));
    return collapseChains(rows);
  };
  const lines = [
    ...MEMBERS.flatMap((m) => runPart(m.opener)),
    ...MEMBERS.flatMap((m) => runPart(m.loop)),
  ];

  return { state, lines, report: buildReport(lines, { config: state.config }) };
}

function main(): void {
  const showEntries = process.argv.includes("--entries");
  const { state, report } = runTeam();
  const fmt = (n: number): string => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

  console.log(`Team: ${MEMBERS.map((m) => m.name).join(" -> ")}  `
    + `level ${state.config.level} vs level ${state.enemy.level}, ${state.enemy.baseRes[Element.Physical] ?? 0}% res\n`);

  console.log(renderReport(report, { showParts: false }));

  if (showEntries) {
    for (const row of report.rows) {
      console.log(`\n  ${row.raw.i}  ${row.raw.action}`);
      // ChainGroup.snap is typed as the plain damage.ts Snapshot, but every row here was built
      // from state.run()'s own resolved snapshots — explain() wants their `entries`.
      for (const { label, value } of explain(row.line.snap as ResolvedSnapshot)) {
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
