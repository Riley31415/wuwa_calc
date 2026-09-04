/**
 * Solve the whole roster under the default filters and write it out as `solves.json`, so the
 * published site (GitHub Pages — no dev server, no workers' worth of waiting) opens straight onto
 * a full table. index.ts's own `loadSolves()` reads the file back exactly as it reads its own
 * localStorage save (`SolveSave`), keyed by the same `bestKey()`/`picksKey()`, so every team a
 * cold load asks for is already answered; only a filter change solves live, and even that starts
 * from the shipped picks.
 *
 *     npm run build && npm run precompute      ->  solves.json beside index.html
 *
 * Runs after the bundle, not before: the stamp is a hash of dist/bundle/, the very code the page
 * loads, so a rebuild that moves any number is a new stamp and the old file is ignored rather than
 * trusted. Node has no `self`, so solver.ts's own browser-worker entry stays out of the way (see
 * its foot); the fan-out here is worker_threads over this same file, one team in flight per
 * thread, mirroring index.ts's own `solveOnWorkers()`.
 */
import { isMainThread, parentPort, Worker } from "node:worker_threads";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { cpus } from "node:os";
import { fileURLToPath } from "node:url";
import { ALL_TEAMS, teamKey } from "./engine/teams.js";
import { teamFromKey, solveTeam, defaultFilters, bestKey, picksKey } from "./solver.js";
import type { Solved, SolveSave } from "./solver.js";

const filters = defaultFilters();

if (!isMainThread) {
  parentPort!.on("message", (key: string) => {
    parentPort!.postMessage({ key, solved: solveTeam(key, teamFromKey(key), filters, null) });
  });
} else {
  const bundle = new URL("../bundle/", import.meta.url);
  const hash = createHash("sha1");
  for (const f of readdirSync(bundle).sort()) if (f.endsWith(".js")) hash.update(readFileSync(new URL(f, bundle)));
  const stamp = hash.digest("hex").slice(0, 16);

  const keys = ALL_TEAMS.map((_, i) => teamKey(i));
  const save: SolveSave = { stamp, solves: [], picks: [] };
  const started = Date.now();
  let next = 0, done = 0;
  const threads = Math.max(1, Math.min(8, cpus().length - 1, keys.length));
  const workers = Array.from({ length: threads }, () => new Worker(fileURLToPath(import.meta.url)));

  await new Promise<void>((resolve) => {
    const pump = (w: Worker): void => {
      if (next >= keys.length) { void w.terminate(); return; }
      w.postMessage(keys[next++]);
    };
    for (const w of workers) {
      w.on("message", ({ key, solved }: { key: string; solved: Solved }) => {
        const members = teamFromKey(key);
        save.solves.push([bestKey(key, members, filters), solved]);
        save.picks.push([picksKey(key, members, filters), solved.picks]);
        const names = members.map((m) => m.loadout.resonator.name).join("/");
        console.log(`${++done}/${keys.length}  ${key}  ${names}  ${((Date.now() - started) / 1000).toFixed(1)}s`);
        if (done === keys.length) resolve();
        pump(w);
      });
      w.on("error", (err) => { console.error(err); process.exit(1); });
      pump(w);
    }
  });

  const out = new URL("../../solves.json", import.meta.url);
  writeFileSync(out, JSON.stringify(save));
  console.log(`wrote ${fileURLToPath(out)}  (${keys.length} teams, stamp ${stamp}, ${(readFileSync(out).length / 1024).toFixed(0)} KB)`);
}
