/**
 * The tuner budget table (tuning/out/best.md), off the runs best.ts left in tuning/out/ alone. It
 * imports nothing of the engine, so it renders whatever state another session leaves the build in.
 * `npx tsc && node dist/tuning/table.js [dir=best]`
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

/** One resonator's runs and what they ran on: each run's damage, whether its ER stood, and its 13
 *  substat sums, indexed by `Substat` — and, from runs made since, its lines. */
export interface Kept {
  who: string; key: string; names: string[]; total: number; weapon: string; echo: string; mainstat: string;
  chem: number; erWant: number; erNeed: number; terms: number; gap: number;
  runs: number; budget: number; seed: number; er: number; bonus: number; seconds: number;
  results: { damage: number; met: boolean; rolls: number; echoes: number; net: number; subs: number[]; lines?: [number, number][] }[];
  /** The picks run on, and what a line of each substat is worth to their damage (best.ts's `worthOf`). */
  picks?: unknown[];
  worth?: number[];
  /** A main DPS on the team they ran on (teams.ts's `mdps`). */
  mainDps?: boolean;
}
export interface Skipped { who: string; skipped: string }

/** Off the working directory (the repo root), not this file: a run can go from a private copy of
 *  the build, out of reach of another session rebuilding dist/, and still land here. */
export const OUT = new URL("tuning/out/", pathToFileURL(`${process.cwd()}/`));
/** A set of runs' folder in tuning/out/: `best` unless best.ts was given another (`dir=`). */
export const bestOf = (dir: string): URL => new URL(`${dir}/`, OUT);

/** The substat columns, in `Substat` order (a run's `subs` are indexed by it), and which are flat. */
const LABELS = ["CR", "CD", "ER", "ATK%", "ATK", "HP%", "HP", "DEF%", "DEF", "Basic", "Heavy", "Skill", "Lib"];
const FLAT = new Set(["ATK", "HP", "DEF"]);

/** A line worth less than this share of a resonator's damage is filler, and stays out of their build. */
const FILLER = 0.0025;

/** A resonator's runs as one build: each substat's median line count over the runs, most lines first
 *  and ties to the stat whose lines are worth the more — ER first among them where their Liberation
 *  needs it — leaving out the stats that take none and the filler: a stat whose lines are worth under
 *  `FILLER` of their damage apiece, needed ER excepted. As a string ("554221": two stats on five
 *  lines, one on four, ...) and as the order of the stats those digits are. */
export function buildOf(k: Kept): { digits: string; priority: string } {
  const mid = Math.floor((k.results.length - 1) / 2);
  const needed = (s: number): boolean => s === 2 && k.erNeed > 0;
  const worth = (s: number): number => (needed(s) ? Infinity : k.worth?.[s] ?? 0);
  const held = LABELS.map((label, s) => ({ label, s, n: k.results.map((r) => r.lines!.filter(([x]) => x === s).length).sort((a, b) => a - b)[mid]! }))
    .filter(({ n, s }) => n > 0 && (!k.worth || k.worth[s]! >= FILLER || needed(s)))
    .sort((a, b) => b.n - a.n || worth(b.s) - worth(a.s));
  return { digits: held.map((h) => h.n).join(""), priority: held.map((h) => h.label).join(" > ") };
}

/** Each run's own build string, the way `buildOf` reads the median one — the stats that count,
 *  their line counts most first — and every one at least `cutoff` of the runs end on, the cutoff
 *  raised from 1% a run at a time until at most 7 are left, highest average damage first: the
 *  string, its share of the runs and its average damage as a share of ChemX32. */
function commonBuilds(k: Kept): { cutoff: number; builds: { digits: string; share: number; damage: number }[] } {
  const by = new Map<string, { n: number; damage: number }>();
  for (const r of k.results) {
    const digits = LABELS.map((_, s) => r.lines!.filter(([x]) => x === s).length)
      .filter((n, s) => n > 0 && (!k.worth || k.worth[s]! >= FILLER || (s === 2 && k.erNeed > 0)))
      .sort((a, b) => b - a).join("");
    const seen = by.get(digits) ?? { n: 0, damage: 0 };
    seen.n++;
    seen.damage += r.met ? r.damage : 0;
    by.set(digits, seen);
  }
  let min = Math.ceil(k.results.length / 100);
  while ([...by.values()].filter((b) => b.n >= min).length > 7) min++;
  const builds = [...by].filter(([, b]) => b.n >= min)
    .map(([digits, b]) => ({ digits, share: b.n / k.results.length, damage: b.damage / b.n / k.chem }))
    .sort((a, b) => b.damage - a.damage);
  return { cutoff: min / k.results.length, builds };
}

/** The table, off whatever is on file, highest own damage first, then how the finished setups'
 *  lines rolled against each substat's own odds. */
export function writeTable(dir = "best"): string {
  const best = bestOf(dir);
  const teams = JSON.parse(readFileSync(new URL("teams.json", OUT), "utf8")) as { names: string[] }[];
  const order = [...new Set(teams.flatMap((t) => t.names))];
  const kept = readdirSync(best).map((f) => JSON.parse(readFileSync(new URL(f, best), "utf8")) as Kept | Skipped);
  const byWho = new Map(kept.map((k) => [k.who, k]));
  const head = ["Resonator", "Weapon / echoes", "Formula gap", "ER met",
    "Median Damage", ...LABELS];
  const done: Kept[] = [], skipped: string[] = [], missing: string[] = [];
  for (const who of order) {
    const k = byWho.get(who);
    if (!k) missing.push(who);
    else if ("skipped" in k) skipped.push(`${who} (${k.skipped})`);
    else done.push(k);
  }
  // every line of every finished setup, read against its own substat's roll weights: the share of
  // rolls under its value plus half the share at it, so a line rolled at random averages 50%
  const spreadsFile = new URL("spreads.json", OUT);
  const spreads = existsSync(spreadsFile) ? JSON.parse(readFileSync(spreadsFile, "utf8")) as { values: number[]; weights: number[] }[] : null;
  const builds = done.flatMap((k) => k.results).filter((r) => r.lines);
  const odds: string[][] = [];
  // per substat, a line at its average percentile — what each build's sums are counted in
  let quality: number[] | null = null;
  if (spreads && builds.length) {
    const count = LABELS.map(() => 0), share = LABELS.map(() => 0), sum = LABELS.map(() => 0);
    for (const r of builds) {
      for (const [s, v] of r.lines!) {
        const { values, weights } = spreads[s]!;
        const total = weights.reduce((a, b) => a + b, 0), i = values.indexOf(v);
        count[s] = count[s]! + 1;
        sum[s] = sum[s]! + v;
        share[s] = share[s]! + (weights.slice(0, i).reduce((a, b) => a + b, 0) + weights[i]! / 2) / total;
      }
    }
    quality = LABELS.map((_, s) => {
      const { values, weights } = spreads[s]!;
      const total = weights.reduce((a, b) => a + b, 0);
      // each value's own percentile, the line from one to the next drawn straight
      const ranks = values.map((_, i) => (weights.slice(0, i).reduce((a, b) => a + b, 0) + weights[i]! / 2) / total);
      const p = count[s] ? share[s]! / count[s]! : 0.5;
      if (p <= ranks[0]!) return values[0]!;
      const i = ranks.findIndex((r, j) => j + 1 < ranks.length && p <= ranks[j + 1]!);
      if (i < 0) return values[values.length - 1]!;
      return values[i]! + (values[i + 1]! - values[i]!) * (p - ranks[i]!) / (ranks[i + 1]! - ranks[i]!);
    });
    LABELS.forEach((label, s) => {
      const { values, weights } = spreads[s]!;
      const total = weights.reduce((a, b) => a + b, 0);
      const mean = values.reduce((n, v, i) => n + v * weights[i]!, 0) / total;
      const unit = FLAT.has(label) ? "" : "%", places = FLAT.has(label) ? 0 : 2;
      odds.push([label, (count[s]! / builds.length).toFixed(2), count[s] ? `${(sum[s]! / count[s]!).toFixed(places)}${unit}` : "-",
        `${mean.toFixed(places)}${unit}`, count[s] ? `${(share[s]! / count[s]! * 100).toFixed(1)}%` : "-",
        `${quality![s]!.toFixed(places)}${unit}`]);
    });
  }

  // the table lists main DPS alone; the line report below reads every build
  const listed = done.filter((k) => k.mainDps).sort((a, b) => b.chem - a.chem);
  const rows = listed.map((k) => {
    // a run that ends short on ER is no build: every quantile counts it as nothing
    const all = k.results.map((r) => (r.met ? r.damage : 0)).sort((a, b) => a - b);
    const at = (q: number): string => `${(all[Math.min(all.length - 1, Math.floor(q * all.length))]! / k.chem * 100).toFixed(1)}%`;
    // each stat's median sum over the runs: a stat a kit only sometimes commits to (Sigrika's ER) splits
    // its runs in two, and an average lands where none of them did
    const sums = LABELS.map((_, s) => {
      const v = k.results.map((r) => r.subs[s]!).sort((a, b) => a - b);
      return v.length % 2 ? v[(v.length - 1) / 2]! : (v[v.length / 2 - 1]! + v[v.length / 2]!) / 2;
    });
    return [k.who, `${k.weapon} / ${k.echo}`,
      `${(k.gap * 100).toFixed(3)}%${k.gap > 0.005 ? " (!)" : ""}`,
      `${k.results.filter((r) => r.met).length}/${k.runs}`, at(0.5),
      ...sums.map((v, s) => (FLAT.has(LABELS[s]!) ? v.toFixed(0) : `${v.toFixed(1)}%`)),
      ...(quality ? sums.map((v, s) => (v / quality![s]!).toFixed(2)) : []),
      ...(k.results[0]?.lines ? [buildOf(k).digits, buildOf(k).priority] : [])];
  });
  if (quality) head.push(...LABELS.map((label) => `${label} lines`));
  if (done[0]?.results[0]?.lines) head.push("Build", "Priority");

  const line = (cells: string[]): string => `| ${cells.join(" | ")} |`;
  const first = done[0];
  const oddsHead = ["Substat", "Lines a build", "Average line", "Average roll", "Average percentile", "Line at average percentile"];
  const table = [
    "# Tuner budget runs",
    "",
    first ? `${first.runs} runs a resonator, ${first.budget} tuners each (refunds spent as they come), seed ${first.seed}, steered by ER`
      + ` weight ${first.er} and bonus ${first.bonus}. Each resonator on their strongest s0r1 team by team total of those they're the`
      + " main DPS of, wearing that solve's"
      + " weapon and echoes and the main stats it picks with their High Invest Substats box open; substats tuned from nothing."
      + " Main DPS only, highest own damage first. Median Damage is personal damage as a share of the same"
      + " build on ChemX32 substats, a run that ends short of its ER requirement counting as nothing. The stat columns are the"
      + " median final sum of each substat over every run, and the \"lines\" columns that sum over a line at the substat's average"
      + " percentile across every build (the table below). Build is each substat's median line count over the runs, most lines"
      + " first, leaving out the stats that take none and the filler: lines worth under 0.25% of the resonator's damage apiece"
      + " (ER kept where their Liberation needs it). Priority is the stats those digits are, in the same order, ties going to"
      + " the stat whose lines are worth the more and needed ER first among them. A formula gap over 0.5% (!) means the kit reads its own stats back and"
      + " the damage figures are off by about that much." : "",
    "",
    line(head),
    line(head.map(() => "---")),
    ...rows.map(line),
    "",
    skipped.length ? `Skipped: ${skipped.join(", ")}.` : "",
    missing.length ? `Not run yet: ${missing.join(", ")}.` : "",
    "",
    "## Builds by damage",
    "",
    "Every run's own build string, read the way the Build column reads the median one (the stats that count, their"
      + " line counts most first). Every build at least Cutoff of a resonator's runs end on — the cutoff raised from 1% until"
      + " at most 7 are left — highest average damage first: the build, its share of the runs, and its runs' average"
      + " damage as a share of ChemX32.",
    "",
    ...(listed[0]?.results[0]?.lines ? [line(["Resonator", "Cutoff", "Builds"]), line(["---", "---:", "---"]),
      ...listed.map((k) => {
        const { cutoff, builds } = commonBuilds(k);
        return line([k.who, `${(cutoff * 100).toFixed(1)}%`, builds
          .map((b) => `${b.digits} ${(b.share * 100).toFixed(1)}% ${(b.damage * 100).toFixed(1)}%`).join(" · ")]);
      }), ""] : []),
    "## How the kept lines rolled",
    "",
    odds.length
      ? `Every line of every finished setup (${builds.length} builds, ${done.length} resonators), each read against its own`
        + " substat's roll weights: its percentile is the share of rolls under its value plus half the share at it, so a line"
        + " rolled at random averages 50%. Lines a build is how many of that substat a finished setup holds on average; Average"
        + " line is what those lines rolled, Average roll what a line rolls at random. Line at average percentile is the value"
        + " that percentile lands on, read straight between the two rolls either side of it — the main table's \"lines\" columns"
        + " are each build's median sum of a substat over it."
      : "No line data on file yet — the runs have to be made again to keep each setup's lines.",
    "",
    ...(odds.length ? [line(oddsHead), line(oddsHead.map(() => "---")), ...odds.map(line), ""] : []),
  ].join("\n");
  writeFileSync(new URL(`${dir}.md`, OUT), table);
  return table;
}

if (fileURLToPath(import.meta.url).toLowerCase() === (process.argv[1] ?? "").toLowerCase()) {
  console.log(writeTable(process.argv.find((a) => a.startsWith("dir="))?.slice(4)));
}
