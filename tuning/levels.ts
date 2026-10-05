/**
 * Each tuner budget's builds side by side (tuning/out/levels.md), off the runs best.ts left in
 * tuning/out/best-<n>k/ (`budget=9000 dir=best-9k`, ...). Like table.ts it imports nothing of the engine.
 * `npx tsc && node dist/tuning/levels.js`
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { OUT, bestOf, buildOf } from "./table.js";
import type { Kept, Skipped } from "./table.js";

/** Kits whose builds run past the usual five or six stats, named wherever their build is listed. */
const NAMED = new Set(["Jingran", "Qingxiao"]);

const byBudget = new Map<number, Kept[]>();
for (const dir of readdirSync(OUT, { withFileTypes: true }).filter((d) => d.isDirectory() && /^best-\d+k$/.test(d.name))) {
  const best = bestOf(dir.name);
  for (const f of readdirSync(best)) {
    const k = JSON.parse(readFileSync(new URL(f, best), "utf8")) as Kept | Skipped;
    if ("skipped" in k || !k.mainDps) continue;
    byBudget.set(k.budget, [...(byBudget.get(k.budget) ?? []), k]);
  }
}
const budgets = [...byBudget.keys()].sort((a, b) => a - b);
// only resonators run at every budget, so each budget's list is of the same roster
for (const b of budgets) {
  byBudget.set(b, byBudget.get(b)!.filter((k) => budgets.every((c) => byBudget.get(c)!.some((x) => x.who === k.who))));
}
const label = (budget: number): string => `${budget / 1000}k`;
// a run short of its ER requirement counts as nothing, as in best.md
const median = (k: Kept): number => {
  const all = k.results.map((r) => (r.met ? r.damage : 0)).sort((a, b) => a - b);
  return all[Math.floor(all.length / 2)]! / k.chem;
};

const line = (cells: string[]): string => `| ${cells.join(" | ")} |`;
const out = [
  "# Builds by tuner budget",
  "",
  "Each main DPS run at every budget, and their build at each, read the way best.md's Build column reads it: each"
    + " substat's median line count over the resonator's runs, most lines first, the stats that take none and the filler"
    + " left out. Every budget runs the same teams, weapons, echoes and main stats.",
  "",
];
for (const budget of budgets) {
  const builds = new Map<string, string[]>();
  for (const k of byBudget.get(budget)!.sort((a, b) => b.chem - a.chem)) {
    const { digits } = buildOf(k);
    builds.set(digits, [...(builds.get(digits) ?? []), k.who]);
  }
  out.push(`## ${label(budget)} tuners`, "", line(["Build", "Resonators"]), line(["---", "---"]),
    ...[...builds].sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([digits, who]) => line([digits, who.map((w) => (NAMED.has(w) ? `**${w}**` : w)).join(", ")])), "");
}
const everyone = [...new Map(budgets.flatMap((b) => byBudget.get(b)!).map((k) => [k.who, k])).values()].sort((a, b) => b.chem - a.chem);
out.push("## Each resonator by budget", "", "Build and median damage as a share of ChemX32 on the same main stats.", "",
  line(["Resonator", ...budgets.map(label)]), line(["---", ...budgets.map(() => "---")]),
  ...everyone.map((who) => line([NAMED.has(who.who) ? `**${who.who}**` : who.who, ...budgets.map((b) => {
    const k = byBudget.get(b)!.find((x) => x.who === who.who);
    return k ? `${buildOf(k).digits} ${(median(k) * 100).toFixed(1)}%` : "-";
  })])), "");
writeFileSync(new URL("levels.md", OUT), out.join("\n"));
console.log(out.join("\n"));
