/**
 * Runs the tuning simulator over Qingxiao's goals — internal testing only. Each goal, mode and
 * strategy in turn runs its runs split over worker threads, every core by default, stopped together
 * once the median is settled.
 * `npx tsc && node dist/tuning/run.js [runs=1000] [seed=1] [limit=<tuners>] [strategies=index-all,greedy]
 *  [goals=554421,555321] [modes=er,er-cr,er-cr-cd] [shards=<threads, every core by default>] [fresh=1]`
 * A job's finished runs are kept in tuning/out/goals/ under a hash of the simulation code and the main
 * stats, and reused by the next run asking for the same job, so a new column needs no new runs;
 * `fresh=1` runs them anyway.
 */
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { cpus } from "node:os";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Substat, rollAt } from "../src/shared/substats.js";
import { Target, totalsOf } from "./target.js";
import { buildOf, linesOf, tierUpPercentile, goalOf, Batch, mediansOf } from "./sim.js";
import type { Tuned, Median, Strategy, Bucket } from "./sim.js";

const S = Substat;
// her priority, ER's two lines put in where each goal's 2 falls
const priority = [S.CritRate, S.CritDmg, S.AtkPct, S.FlatAtk, S.Heavy, S.Liberation];

/** Which stats' own sums a setup has to fill besides the target damage, and which steer the climb
 *  (`goalOf`). min er, cr steers by CD as well: it never costs more than min er, cr, cd that way,
 *  and at 2,000 runs it came out cheaper than steering by ER and CR alone on all five goals. ER
 *  alone steered best by itself — CD as a guide was no better, CR and CD 40% worse. */
const MODES: Record<string, { label: string; mins: Bucket[]; guides?: Bucket[] }> = {
  "er": { label: "min er + target damage", mins: [S.Er] },
  "er-cr": { label: "min er, cr + target damage", mins: [S.Er, S.CritRate], guides: [S.Er, S.CritRate, S.CritDmg] },
  "er-cr-cd": { label: "min er, cr, cd + target damage", mins: [S.Er, S.CritRate, S.CritDmg] },
  "er-cr-cd-atk-dmg": { label: "min er, cr, cd, atk, dmg + target damage", mins: [S.Er, S.CritRate, S.CritDmg, "atk", "dmg"] },
};
type Mode = string;
interface Job { digits: string; mode: Mode; strategy: Strategy }
interface Shard extends Job { seed: number; from: number; count: number }
interface Progress { round: number; running: number; done: Tuned[] }

const p = tierUpPercentile();
// the main stats every simulated setup wears, and the ChemX32 build dmg% is measured against
const MAINSTAT = "43311 CD ATK Aero atk atk";
const target = Target.solved(["Mornye", "Denia", "Qingxiao"], "Qingxiao", MAINSTAT, linesOf(buildOf("554421", priority), p));

if (!isMainThread) {
  const shard = workerData as Shard;
  const build = buildOf(shard.digits, priority);
  const { label, mins, guides } = MODES[shard.mode]!;
  const goal = goalOf(label, target, build, p, mins, guides);
  const batch = new Batch(goal, shard.strategy, shard.seed, shard.from, shard.count);
  // rounds go on the event loop, off module evaluation, so the main thread's "stop" gets through
  let stopped = false;
  parentPort!.once("message", () => {
    stopped = true;
  });
  const tick = (): void => {
    if (!stopped) {
      batch.step(256);
      parentPort!.postMessage({ round: batch.round, running: batch.running, done: batch.take() } satisfies Progress);
    }
    if (stopped || !batch.running) parentPort!.close();
    else setImmediate(tick);
  };
  setImmediate(tick);
} else {
  const arg = (key: string, fallback: string): string =>
    process.argv.slice(2).find((a) => a.startsWith(`${key}=`))?.slice(key.length + 1) ?? fallback;
  const runs = +arg("runs", "1000");
  const chem = target.chem();
  const seed = +arg("seed", "1");
  const limit = +arg("limit", "10000000");
  const strategies = arg("strategies", "index-all").split(",") as Strategy[];
  const goals = arg("goals", "554421,554432,5544321,555321,555432").split(",");
  const modes = arg("modes", Object.keys(MODES).join(",")).split(",") as Mode[];
  console.log(`${target.key} Qingxiao, ${target.terms} formula terms; goal lines at the ${(p * 100).toFixed(1)}th percentile`
    + ` (CR ${rollAt(S.CritRate, p)}, CD ${rollAt(S.CritDmg, p)}, ATK% ${rollAt(S.AtkPct, p)}, Flat ${rollAt(S.FlatAtk, p)}, ER ${rollAt(S.Er, p)});`
    + ` base ATK ${target.baseAtk}; main stats ${MAINSTAT}, ChemX32 ${chem.toFixed(0)}`);
  console.log(`${runs} runs each, medians, tuner limit ${limit}`);
  const jobs: Job[] = modes.flatMap((mode) => goals.flatMap((digits) => strategies.map((strategy) => ({ digits, mode, strategy }))));
  const shards = +arg("shards", String(cpus().length));

  // a job's runs as it stopped: what finished, and how far the rest had got
  interface Kept { done: Tuned[]; round: number; running: number; seconds: number }
  const code = createHash("sha1").update(readFileSync(new URL("./sim.js", import.meta.url)))
    .update(readFileSync(new URL("./target.js", import.meta.url))).update(MAINSTAT).digest("hex").slice(0, 8);
  const dir = new URL("tuning/out/goals/", pathToFileURL(`${process.cwd()}/`));
  const fileOf = (job: Job): URL => new URL(`${job.digits}-${job.mode}-${job.strategy}-r${runs}-s${seed}-l${limit}-${code}.json`, dir);

  const solve = (job: Job): Promise<Kept> => new Promise((resolve, reject) => {
    const t0 = Date.now();
    let finished = false;
    const done: Tuned[] = [];
    const state = Array.from({ length: shards }, () => ({ round: 0, running: 1 }));
    const workers = state.map((_, k) => {
      const from = Math.floor(runs * k / shards), to = Math.floor(runs * (k + 1) / shards);
      const worker = new Worker(new URL(import.meta.url), { workerData: { ...job, seed, from, count: to - from } satisfies Shard });
      worker.on("message", (m: Progress) => {
        // a job's runs are what had finished when it stopped, whatever lands after
        if (finished) return;
        done.push(...m.done);
        state[k] = { round: m.round, running: m.running };
        const going = state.filter((s) => s.running);
        const round = going.length ? Math.min(...going.map((s) => s.round)) : Infinity;
        const running = going.reduce((n, s) => n + s.running, 0);
        if (!mediansOf(done, runs, round, running) && round * 10 < limit) return;
        finished = true;
        for (const w of workers) w.postMessage("stop");
        resolve({ done, round, running, seconds: (Date.now() - t0) / 1000 });
      });
      worker.once("error", reject);
      return worker;
    });
  });

  // the substat columns are the finished runs' average setup
  const shown: [Substat, string, number][] = [[S.Er, "ER", 1], [S.CritRate, "CR", 1], [S.CritDmg, "CD", 1], [S.AtkPct, "ATK%", 1],
    [S.FlatAtk, "Flat", 0], [S.Basic, "Basic", 1], [S.Heavy, "Heavy", 1], [S.Skill, "Skill", 1], [S.Liberation, "Lib", 1]];
  const wide = Math.max(...modes.map((mode) => MODES[mode]!.label.length)) + 2;
  const line = (goal: string, mode: string, rest: string[], stats: string[]): string =>
    goal.padStart(8) + "  " + mode.padEnd(wide) + rest.map((c) => c.padStart(10)).join("") + stats.map((c) => c.padStart(8)).join("");
  const header = line("goal", "mode", ["strategy", "dmg%", "done", "net", "echoes", "trashed", "secs"], shown.map(([, label]) => label));
  const rowOf = (job: Job, r: Kept): string => {
    const pct = target.damageAt(totalsOf(linesOf(buildOf(job.digits, priority), p))) / chem * 100;
    const m: Median | null = mediansOf(r.done, runs, r.round, r.running);
    const figures = m ? [m.net, m.echoes, m.trashed].map(String) : ["-", "-", "-"];
    return line(job.digits, MODES[job.mode]!.label, [job.strategy, `${pct.toFixed(1)}%`, `${r.done.length}/${runs}`, ...figures, r.seconds.toFixed(0)],
      shown.map(([s, , places]) => (m ? m.subs[s]!.toFixed(places) + (s === S.FlatAtk ? "" : "%") : "-")));
  };
  // one job at a time: a job's threads have to run side by side for the median to settle, and
  // running them alone keeps every core on the job still going. Each row as it finishes, then the
  // whole table grouped
  console.log(header);
  const results: Kept[] = [];
  mkdirSync(dir, { recursive: true });
  for (const job of jobs) {
    const file = fileOf(job);
    let kept: Kept;
    if (arg("fresh", "") !== "1" && existsSync(file)) kept = JSON.parse(readFileSync(file, "utf8")) as Kept;
    else {
      kept = await solve(job);
      writeFileSync(file, JSON.stringify(kept));
    }
    results.push(kept);
    console.log(rowOf(job, kept));
  }
  // the whole table grouped, also kept as tuning/out/goals.txt
  const table = [header, ...jobs.flatMap((job, i) => [...(i && job.mode !== jobs[i - 1]!.mode ? [""] : []), rowOf(job, results[i]!)])];
  writeFileSync(new URL("../goals.txt", dir), `${table.join("\n")}\n`);
  console.log(`\n${table.join("\n")}`);
}
