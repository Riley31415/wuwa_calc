/**
 * How far a tuner budget takes each resonator — internal testing only. Each one's strongest team at
 * s0r1 (by team total) of those they're the main DPS of, with the echo set and weapon that solve wears and the main stats it picks
 * once their High Invest Substats box is open, then `runs` runs
 * of tuning from nothing for the most personal damage, their ER requirement met, until `budget`
 * tuners (refunds spent as they come) run out. Resonators under 100k personal damage on that team
 * are skipped.
 *
 * Everything lands in tuning/out/: the team solves (teams.json), each resonator's runs
 * (best/<name>.json) and the table (best.md), rendered from those files alone (table.ts, which
 * re-renders it without the engine) — a resonator already on file is not run again unless `fresh=1`.
 * `dir=` puts the runs and their table under another name than `best`, to keep another budget's apart.
 * `npx tsc && node dist/tuning/best.js [who=all|Name,Name] [runs=1000] [budget=15000] [seed=1] [er=4] [dir=best]
 *  [bonus=5] [fresh=1] [main=Name:<main stats>;...] [erfloor=Name:<ER>;...] [shards=<threads, every core by default>] [worth]`
 * `worth` fills in, for runs already on file, whether each is a main DPS and what each stat's lines are worth.
 */
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { cpus } from "node:os";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { Substat, spreadCounts, rollSpread } from "../src/shared/substats.js";
import { ALL_TEAMS, teamKey, teamAt } from "../src/resonators/teams.js";
import { teamFromKey, optimizeTeam, solveTeam, defaultFilters, comboOf, echoLabel } from "../src/solve/solver.js";
import type { Pick } from "../src/solve/solver.js";
import { runTeam } from "../src/solve/teamrun.js";
import { Target, SUBSTATS } from "./target.js";
import type { Line } from "./target.js";
import { linesOf, maxOf, Batch, rng } from "./sim.js";
import type { Build } from "./sim.js";
import { writeTable, OUT, bestOf } from "./table.js";
import type { Kept } from "./table.js";

/** One team as the s0r1 solve left it. */
interface Solved { key: string; names: string[]; picks: Pick[]; total: number; own: Record<string, number> }

type Job =
  | { kind: "teams"; keys: string[] }
  | { kind: "tune"; key: string; who: string; picks: Pick[]; seed: number; from: number; count: number; budget: number; er: number; bonus: number; floor: number }
  | { kind: "worth"; who: string[]; dir: string };

/**
 * What a line of each substat is worth to a resonator's damage, as a share of it, at their runs'
 * median finished setup: what that setup's own lines of it are worth apiece (the damage lost taking
 * them all out, over how many there are) — so a stat a cap stops paying at the margin still counts
 * for what its lines do — or, for a stat the setup holds none of, what one average line more adds.
 */
function worthOf(target: Target, results: Kept["results"]): number[] {
  const mid = Math.floor((results.length - 1) / 2);
  const median = (f: (r: Kept["results"][number]) => number): number => results.map(f).sort((a, b) => a - b)[mid]!;
  const at = Float64Array.from(SUBSTATS, (s) => median((r) => r.subs[s]!));
  const base = target.damageAt(at);
  return SUBSTATS.map((s) => {
    const lines = median((r) => r.lines!.filter(([x]) => x === s).length);
    const t = at.slice();
    if (lines > 0) {
      t[s] = 0;
      return (base - target.damageAt(t)) / lines / base;
    }
    const { values, weights } = rollSpread(s);
    t[s] = t[s]! + values.reduce((n, v, i) => n + v * weights[i]!, 0) / weights.reduce((a, b) => a + b, 0);
    return (target.damageAt(t) - base) / base;
  });
}

/** The ChemX32 spread `who` wears on `key`, as line counts — the finished build a line is priced against. */
const anchorOf = (key: string, who: string): Build =>
  spreadCounts(teamFromKey(key).find((m) => m.name === who)!.loadout.substat.named);

const fileOf = (dir: string, who: string): URL => new URL(`${who.replace(/[^A-Za-z0-9]+/g, "_")}.json`, bestOf(dir));

/** Whether `who` is a main DPS on the team of `names` (teams.ts's `mdps`) — found by its key, or by
 *  its members where the roster has moved since the run. */
function mainDpsOf(key: string, names: string[], who: string): boolean {
  const same = (t: { loadouts: { resonator: { name: string } }[] }): boolean =>
    t.loadouts.length === names.length && t.loadouts.every((l, i) => l.resonator.name === names[i]);
  const keyed = teamAt(key);
  const team = keyed && same(keyed) ? keyed : ALL_TEAMS.find(same);
  return team?.mdps[names.indexOf(who)] ?? false;
}

if (!isMainThread) {
  const job = workerData as Job;
  if (job.kind === "teams") {
    const solved: Solved[] = [];
    for (const key of job.keys) {
      const members = teamFromKey(key);
      try {
        const picks = optimizeTeam(key, members, defaultFilters());
        const run = runTeam(key, members, picks.map((p, j) => comboOf(members[j]!.loadout, p)));
        solved.push({ key, names: members.map((m) => m.name), picks, total: run.total, own: Object.fromEntries(run.bySlot) });
      } catch {
        // a team the solve can't field at this cost (an Energy bar it can't fill) is no team
      }
    }
    parentPort!.postMessage(solved);
  } else if (job.kind === "worth") {
    // runs already on file, given what each stat's lines are worth to them
    const teams = JSON.parse(readFileSync(new URL("teams.json", OUT), "utf8")) as Solved[];
    for (const name of job.who) {
      const kept = JSON.parse(readFileSync(fileOf(job.dir, name), "utf8")) as Kept;
      const members = teamFromKey(kept.key), slot = members.findIndex((m) => m.name === name);
      const picks = (kept.picks as Pick[] | undefined) ?? teams.find((t) => t.key === kept.key)!.picks.map((p, j) => (j === slot
        ? { ...p, mainstat: members[slot]!.loadout.mainstats.findIndex((m) => m.name === kept.mainstat) } : p));
      const target = new Target(kept.key, name, picks, linesOf(anchorOf(kept.key, name), 0.5));
      writeFileSync(fileOf(job.dir, name), JSON.stringify({ ...kept, picks, worth: worthOf(target, kept.results) }));
    }
    parentPort!.postMessage(null);
  } else {
    const anchor = anchorOf(job.key, job.who);
    const target = new Target(job.key, job.who, job.picks, linesOf(anchor, 0.5));
    const batch = new Batch(maxOf(job.who, target, anchor, job.er, job.bonus, job.floor), "index-all", job.seed, job.from, job.count, job.budget);
    while (batch.running) batch.step(1024);
    parentPort!.postMessage(batch.take().map((r) => ({
      damage: target.damageAt(r.subs), met: r.subs[Substat.Er]! >= target.erNeed - 1e-9,
      rolls: r.rolls, echoes: r.echoes, net: r.net, subs: r.subs, lines: r.lines.map(([s, v]) => [s, v] as [number, number]),
    })));
  }
} else {
  const args = process.argv.slice(2);
  const arg = (key: string, fallback: string): string => args.find((a) => a.startsWith(`${key}=`))?.slice(key.length + 1) ?? fallback;
  const runs = +arg("runs", "1000"), budget = +arg("budget", "15000"), seed = +arg("seed", "1");
  const er = +arg("er", "4"), bonus = +arg("bonus", "5"), fresh = arg("fresh", "") === "1";
  const shards = +arg("shards", String(cpus().length)), dir = arg("dir", "best"), best = bestOf(dir);
  // main stats held in place of the High Invest pick: main=Name:<main stats>;Name:<main stats>
  const mains = new Map(arg("main", "").split(";").filter(Boolean).map((m) => m.split(":") as [string, string]));
  // ER steered for past the requirement, an experiment: erfloor=Name:<ER from substats>;...
  const floors = new Map(arg("erfloor", "").split(";").filter(Boolean).map((m) => [m.split(":")[0]!, +m.split(":")[1]!]));
  mkdirSync(best, { recursive: true });
  // every substat's roll spread, for table.ts to read lines against without the engine
  writeFileSync(new URL("spreads.json", OUT), JSON.stringify(SUBSTATS.map((s) => {
    const { values, weights, label } = rollSpread(s);
    return { label, values, weights };
  })));
  const roster = [...new Set(ALL_TEAMS.flatMap((t) => t.loadouts.map((l) => l.resonator.name)))];
  const who = arg("who", "all") === "all" ? roster : arg("who", "all").split(",");
  const work = <T>(jobs: Job[]): Promise<T[]> => Promise.all(jobs.map((job) => new Promise<T>((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: job });
    worker.once("message", resolve);
    worker.once("error", reject);
  })));

  // `worth`: runs on file given what they don't carry yet — whether they're a main DPS, and what
  // each stat's lines are worth
  if (args.includes("worth")) {
    const onFile = readdirSync(best).map((f) => JSON.parse(readFileSync(new URL(f, best), "utf8")) as Kept | { skipped: string })
      .filter((k): k is Kept => !("skipped" in k));
    for (const k of onFile.filter((k) => k.mainDps === undefined)) {
      writeFileSync(fileOf(dir, k.who), JSON.stringify({ ...k, mainDps: mainDpsOf(k.key, k.names, k.who) }));
    }
    const lacking = onFile.filter((k) => !k.worth).map((k) => k.who);
    await work(Array.from({ length: Math.min(shards, lacking.length) }, (_, j) => ({ kind: "worth", who: lacking.filter((_, i) => i % shards === j), dir })));
    console.log(`${lacking.length} resonators given each stat's worth`);
    console.log(writeTable(dir));
    process.exit(0);
  }

  // every team, solved once at s0r1 and kept
  const teamsFile = new URL("teams.json", OUT);
  let teams: Solved[];
  if (!fresh && existsSync(teamsFile)) teams = JSON.parse(readFileSync(teamsFile, "utf8")) as Solved[];
  else {
    const t0 = Date.now();
    const keys = ALL_TEAMS.map((_, i) => teamKey(i));
    teams = (await work<Solved[]>(Array.from({ length: shards }, (_, k) => ({ kind: "teams", keys: keys.filter((_, i) => i % shards === k) })))).flat();
    writeFileSync(teamsFile, JSON.stringify(teams));
    console.log(`${teams.length}/${keys.length} teams solved at s0r1 in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }

  for (const name of who) {
    if (!fresh && existsSync(fileOf(dir, name))) continue;
    // their strongest team where they're the main DPS
    const mine = teams.filter((t) => t.names.includes(name) && mainDpsOf(t.key, t.names, name));
    if (!mine.length) {
      writeFileSync(fileOf(dir, name), JSON.stringify({ who: name, skipped: "the main DPS of no team that solves at s0r1" }));
      continue;
    }
    const best = mine.reduce((a, b) => (b.total > a.total ? b : a));
    if ((best.own[name] ?? 0) < 100000) {
      writeFileSync(fileOf(dir, name), JSON.stringify({ who: name, skipped: `${((best.own[name] ?? 0) / 1000).toFixed(0)}k own on ${best.names.join(" / ")}` }));
      console.log(`${name}: skipped, ${(best.own[name] ?? 0).toFixed(0)} own on ${best.names.join(" / ")}`);
      continue;
    }
    const t0 = Date.now();
    // the main stats they hold are the ones the solve picks with their High Invest Substats box open
    const members = teamFromKey(best.key);
    const slot = members.findIndex((m) => m.name === name);
    // or, named in `main`, the ones asked for
    const high = solveTeam(best.key, members, { ...defaultFilters(), substats: [name] }, best.picks).rows.find((row) => row[slot]!.highSubs)?.[slot];
    if (!high) throw new Error(`${name}: no High Invest row on ${best.names.join(" / ")}`);
    const asked = mains.get(name);
    const mainstat = asked === undefined ? high.mainstat : members[slot]!.loadout.mainstats.findIndex((m) => m.name === asked);
    if (mainstat < 0) throw new Error(`${name} has no main stats named ${asked}`);
    const picks = best.picks.map((p, j) => (j === slot ? { ...p, mainstat } : p));
    const anchor = anchorOf(best.key, name);
    const target = new Target(best.key, name, picks, linesOf(anchor, 0.5));
    // the formula against full fights, on builds rolled at random
    const random = rng(seed);
    const roll = (s: Substat): number => {
      const { values, weights } = rollSpread(s);
      let r = random() * weights.reduce((a, b) => a + b, 0);
      for (let i = 0; i < values.length; i++) {
        if ((r -= weights[i]!) < 0) return values[i]!;
      }
      return values[values.length - 1]!;
    };
    const builds = Array.from({ length: 8 }, () => Array.from({ length: 5 }, () => [...SUBSTATS].sort(() => random() - 0.5).slice(0, 5))
      .flat().map((s): Line => [s, roll(s)]));
    const gap = target.check(builds);
    const results = (await work<Kept["results"]>(Array.from({ length: shards }, (_, k) => {
      const from = Math.floor(runs * k / shards), to = Math.floor(runs * (k + 1) / shards);
      return { kind: "tune", key: best.key, who: name, picks, seed, from, count: to - from, budget, er, bonus, floor: floors.get(name) ?? 0 };
    }))).flat();
    const me = members[slot]!;
    const combo = comboOf(me.loadout, picks[slot]!);
    const kept: Kept = {
      who: name, key: best.key, names: best.names, total: best.total, weapon: combo.weapon.name, echo: echoLabel(me.loadout, combo.echo),
      mainstat: combo.mainstat.name, chem: target.chem(), erWant: target.erWant, erNeed: target.erNeed, terms: target.terms, gap,
      runs, budget, seed, er, bonus, seconds: (Date.now() - t0) / 1000, results, picks, worth: worthOf(target, results),
      mainDps: mainDpsOf(best.key, best.names, name),
    };
    writeFileSync(fileOf(dir, name), JSON.stringify(kept));
    const all = results.map((r) => (r.met ? r.damage : 0)).sort((a, b) => a - b);
    console.log(`${name}: ${best.names.join(" / ")}, median ${(all[Math.floor(all.length / 2)]! / kept.chem * 100).toFixed(1)}% of ChemX32,`
      + ` ER met ${results.filter((r) => r.met).length}/${runs}, formula gap ${(gap * 100).toFixed(3)}%, ${kept.seconds.toFixed(0)}s`);
  }
  console.log(writeTable(dir));
}
