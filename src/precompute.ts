/**
 * Solve the roster offline and write it out under `solves/`, so the published site (GitHub Pages
 * — no dev server, no workers' worth of waiting) opens straight onto a full table and stays
 * instant through the filter flips people actually make. index.ts's own `loadSolves()` reads these
 * back keyed by the same `bestKey()`/`picksKey()` it caches under itself, so every team a cold
 * load asks for is already answered.
 *
 *     npm run build && npm run precompute      ->  solves/ beside index.html
 *
 * Runs after the bundle, not before: the stamp is a hash of dist/bundle/, the very code the page
 * loads, so a rebuild that moves any number is a new stamp and the old files are ignored rather
 * than trusted. Node has no `self`, so solver.ts's own browser-worker entry stays out of the way
 * (see its foot); the fan-out here is worker_threads over this same file, one team in flight per
 * thread, mirroring index.ts's own `solveOnWorkers()`.
 *
 * One file per state plus an index naming them, rather than one big file: the page fetches the
 * index and whichever state it opens on, and reaches for another only when a filter flip actually
 * wants it, so nobody downloads the weapons roster to look at the default table.
 *
 * `STATES` is the whole of what to precompute — a state that isn't listed simply solves in the
 * browser the first time someone opens it, exactly as it did before any of this existed. Only one
 * box is open per entry on purpose: rows are the cross of every open axis (solver.ts's own
 * `rowPicks()`), so two boxes open at once is not twice the work but the product of it. Roster row
 * counts, which is what the file sizes track:
 *
 *     default 486 | sequences 3.5k | echoes 4.8k | weapons 9.7k | weapons+echoes 111k
 */
import { isMainThread, parentPort, Worker } from "node:worker_threads";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { cpus } from "node:os";
import { fileURLToPath } from "node:url";
import { ALL_TEAMS, teamKey } from "./engine/teams.js";
import { teamFromKey, solveTeam, defaultFilters, bestKey, picksKey } from "./solver.js";
import type { Filters, Pick, Solved } from "./solver.js";

const STATES: Record<string, Partial<Filters>> = {
  default: {},
  sequences: { mdpsSequences: true, supportSequences: true },
  echoes: { mdpsEchoes: true, supportEchoes: true },
  weapons: { mdpsWeapons: true, supportWeapons: true },
};

const filtersFor = (state: string): Filters => ({ ...defaultFilters(), ...STATES[state] });

interface Task { key: string; state: string }
interface Done extends Task { solved: Solved }

if (!isMainThread) {
  parentPort!.on("message", ({ key, state }: Task) => {
    const solved = solveTeam(key, teamFromKey(key), filtersFor(state), null);
    parentPort!.postMessage({ key, state, solved });
  });
} else {
  const bundle = new URL("../bundle/", import.meta.url);
  const hash = createHash("sha1");
  for (const f of readdirSync(bundle).sort()) if (f.endsWith(".js")) hash.update(readFileSync(new URL(f, bundle)));
  const stamp = hash.digest("hex").slice(0, 16);

  const keys = ALL_TEAMS.map((_, i) => teamKey(i));
  const tasks: Task[] = Object.keys(STATES).flatMap((state) => keys.map((key) => ({ key, state })));
  const solves = new Map(Object.keys(STATES).map((s) => [s, new Map<string, Solved>()]));
  const picks = new Map(Object.keys(STATES).map((s) => [s, new Map<string, Pick[]>()]));
  const rows: Record<string, number> = {};

  const started = Date.now();
  let next = 0, done = 0;
  const threads = Math.max(1, Math.min(8, cpus().length - 1, tasks.length));
  const workers = Array.from({ length: threads }, () => new Worker(fileURLToPath(import.meta.url)));

  await new Promise<void>((resolve) => {
    let live = workers.length;
    const pump = (w: Worker): void => {
      if (next >= tasks.length) { void w.terminate(); if (--live === 0) resolve(); return; }
      w.postMessage(tasks[next++]);
    };
    for (const w of workers) {
      w.on("message", ({ key, state, solved }: Done) => {
        const members = teamFromKey(key);
        const f = filtersFor(state);
        solves.get(state)!.set(bestKey(key, members, f), solved);
        picks.get(state)!.set(picksKey(key, members, f), solved.picks);
        rows[state] = (rows[state] ?? 0) + solved.rows.length;
        if (++done % 100 === 0 || done === tasks.length) {
          process.stdout.write(`\r${done}/${tasks.length} solves  ${((Date.now() - started) / 1000).toFixed(0)}s   `);
        }
        pump(w);
      });
      w.on("error", (err) => { console.error(err); process.exit(1); });
      pump(w);
    }
  });

  // Keyed by the state's whole filter signature, which is exactly what index.ts computes off its
  // own live filters to look one up. Rebuilt from scratch each run so a state dropped from
  // `STATES` leaves no orphan file behind for the index to not mention.
  const dir = new URL("../../solves/", import.meta.url);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const index: { stamp: string; states: Record<string, string> } = { stamp, states: {} };
  const sizes: [string, number][] = [];
  for (const state of Object.keys(STATES)) {
    const file = `${state}.json`;
    index.states[Object.values(filtersFor(state)).join(",")] = file;
    const path = new URL(file, dir);
    writeFileSync(path, JSON.stringify({ solves: [...solves.get(state)!], picks: [...picks.get(state)!] }));
    sizes.push([state, readFileSync(path).length]);
  }
  writeFileSync(new URL("index.json", dir), JSON.stringify(index));

  const mb = (n: number): string => `${(n / 1024 / 1024).toFixed(1)} MB`;
  console.log(`\n\nwrote ${fileURLToPath(dir)}  —  stamp ${stamp}, ${keys.length} teams per state`);
  for (const [state, bytes] of sizes) {
    console.log(`  ${state.padEnd(10)} ${String(rows[state] ?? 0).padStart(7)} rows  ${mb(bytes).padStart(9)}`);
  }
  const total = sizes.reduce((s, [, b]) => s + b, 0);
  console.log(`  ${"total".padEnd(10)} ${String(Object.values(rows).reduce((a, b) => a + b, 0)).padStart(7)} rows  ${mb(total).padStart(9)}`);
}
