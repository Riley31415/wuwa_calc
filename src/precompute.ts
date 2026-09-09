/**
 * Solve the roster offline into `tests/solves/` (one file per state plus index.json), so the published
 * site opens onto a full table. Run after the bundle: the stamp is a hash of dist/bundle/, and a
 * stamp that doesn't match the running page means the files are ignored. Fan-out is
 * worker_threads over this same file. Only one box is open per state on purpose — rows are the
 * cross of every open axis. Row counts: default 486 | sequences 3.5k | echoes 4.8k | weapons 9.7k.
 *
 * Every key is solved once. `bestKey()`/`picksKey()` fold Matrix Mode away for a team whose members
 * own no Matrix, so each of the three matrix states asks for the very same keys as its non-matrix
 * twin on about two thirds of the roster; those are solved and written by whichever state reaches
 * them first, and `index.json` sends a state to each file its own keys landed in.
 *
 *     npm run build && npm run precompute
 */
import { isMainThread, parentPort, Worker } from "node:worker_threads";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { cpus } from "node:os";
import { fileURLToPath } from "node:url";
import { ALL_TEAMS, teamKey } from "./teams.js";
import { teamFromKey, solveTeam, defaultFilters, bestKey, picksKey, filterSignature } from "./solver.js";
import type { Filters, Pick, Solved } from "./solver.js";

/** The states the site ships; anything else solves in the browser. */
const STATES: Record<string, Partial<Filters>> = {
  default: {},
  "s0r1mdps": { cost: "s0r1mdps" },
  "s0r0": { cost: "s0r0" },
  matrix: { matrix: true },
  "s0r1mdps+matrix": { cost: "s0r1mdps", matrix: true },
  "s0r0+matrix": { cost: "s0r0", matrix: true },
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
  const membersOf = new Map(keys.map((key) => [key, teamFromKey(key)]));
  const solves = new Map(Object.keys(STATES).map((s) => [s, new Map<string, Solved>()]));
  const picks = new Map(Object.keys(STATES).map((s) => [s, new Map<string, Pick[]>()]));
  const rows: Record<string, number> = {};

  // which state solves each key, and so which files a state has to be sent to
  const owner = new Map<string, string>();
  const needs = new Map<string, Set<string>>();
  const tasks: Task[] = [];
  for (const state of Object.keys(STATES)) {
    const f = filtersFor(state);
    const files = new Set<string>();
    for (const key of keys) {
      const members = membersOf.get(key)!;
      for (const k of [bestKey(key, members, f), picksKey(key, members, f)]) {
        const at = owner.get(k);
        if (at !== undefined) { files.add(at); continue; }
        owner.set(k, state);
        files.add(state);
      }
      if (owner.get(bestKey(key, members, f)) === state) tasks.push({ key, state });
    }
    needs.set(state, files);
  }
  const repeats = keys.length * Object.keys(STATES).length - tasks.length;

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
        const members = membersOf.get(key)!;
        const f = filtersFor(state);
        solves.get(state)!.set(bestKey(key, members, f), solved);
        const pk = picksKey(key, members, f);
        if (owner.get(pk) === state) picks.get(state)!.set(pk, solved.picks);
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

  // keyed by filter signature, the same string the page looks up; rebuilt from scratch each run
  const dir = new URL("../../tests/solves/", import.meta.url);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const index: { stamp: string; states: Record<string, string[]> } = { stamp, states: {} };
  const sizes: [string, number][] = [];
  for (const state of Object.keys(STATES)) {
    const file = `${state}.json`;
    index.states[filterSignature(filtersFor(state))] = [...needs.get(state)!].map((s) => `${s}.json`);
    const path = new URL(file, dir);
    writeFileSync(path, JSON.stringify({ solves: [...solves.get(state)!], picks: [...picks.get(state)!] }));
    sizes.push([state, readFileSync(path).length]);
  }
  writeFileSync(new URL("index.json", dir), JSON.stringify(index));

  const mb = (n: number): string => `${(n / 1024 / 1024).toFixed(1)} MB`;
  console.log(`\n\nwrote ${fileURLToPath(dir)}  —  stamp ${stamp}, ${keys.length} teams per state, ${repeats} repeats skipped`);
  for (const [state, bytes] of sizes) {
    const also = [...needs.get(state)!].filter((s) => s !== state);
    console.log(`  ${state.padEnd(16)} ${String(solves.get(state)!.size).padStart(4)} solves ${String(rows[state] ?? 0).padStart(6)} rows  ${mb(bytes).padStart(9)}${also.length ? `   + ${also.join(", ")}` : ""}`);
  }
  const total = sizes.reduce((s, [, b]) => s + b, 0);
  console.log(`  ${"total".padEnd(10)} ${String(Object.values(rows).reduce((a, b) => a + b, 0)).padStart(7)} rows  ${mb(total).padStart(9)}`);
}
