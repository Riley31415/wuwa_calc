// node speed.mjs <tree root> <out.json> [n]: ms per runTeam for every roster team of that tree (zeros picks),
// keyed by member names so a TS tree and the wasm tree line up
import { pathToFileURL } from "node:url";
import { writeFileSync, existsSync } from "node:fs";
globalThis.self = globalThis;
const [root, out, nArg] = process.argv.slice(2);
const n = +(nArg ?? 20);
const load = (p) => import(pathToFileURL(`${root}/dist/src/${p}`).href);
const { ALL_TEAMS } = await load("teams.js");
const solver = await load("solver.js");
const tr = existsSync(`${root}/dist/src/mirror/teamrun.js`) ? await load("mirror/teamrun.js") : await load("teamrun.js");
const zero = { weapon: 0, echo: 0, mainstat: 0, sequence: 0, refine: 0, matrix: false, highSubs: false };
const res = {};
for (let i = 0; i < ALL_TEAMS.length; i++) {
  const key = `t${i}`;
  const members = solver.teamFromKey(key);
  const combo = members.map((m) => solver.comboOf(m.loadout, zero));
  const name = members.map((m) => m.name).join("/");
  try {
    tr.runTeam(key, members, combo);
    const t0 = performance.now();
    for (let k = 0; k < n; k++) tr.runTeam(key, members, combo);
    res[name] = (performance.now() - t0) / n;
  } catch (e) {
    res[name] = null;
  }
}
writeFileSync(out, JSON.stringify(res));
console.log(Object.keys(res).length, "teams");
