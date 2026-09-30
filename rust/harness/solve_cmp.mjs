// solve one team (by member loadout names) under the default s0r1 filters and print its picks and totals
// usage: node solve_cmp.mjs <tree root> Mornye,Rebecca,Lucy
import { pathToFileURL } from "node:url";
const [root, names] = process.argv.slice(2);
const load = (p) => import(pathToFileURL(`${root}/dist/src/${p}`).href);
const { ALL_TEAMS } = await load("teams.js");
const solver = await load("solver.js");
const want = names.split(",");
const nameOf = (l) => l.resonator.name;
const at = ALL_TEAMS.findIndex((t) => t.loadouts.map(nameOf).join(",") === want.join(","));
if (at < 0) {
  console.log("no team", ALL_TEAMS.slice(0, 3).map((t) => t.loadouts.map(nameOf).join(",")));
  process.exit(1);
}
const key = `t${at}`;
const members = solver.teamFromKey(key);
const filters = solver.defaultFilters();
const t0 = performance.now();
const solved = solver.solveTeam(key, members, filters, null);
console.log(key, `${(performance.now() - t0) | 0}ms`, JSON.stringify(solved.picks), JSON.stringify(solved.scores ?? solved.rows).slice(0, 300));
