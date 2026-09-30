// node roster.mjs: every roster team of the reference as [index, [loadout exports]], JSON on one line
import { readdirSync } from "node:fs";
import { R } from "./members.mjs";
const teams = await import(R + "teams.js");
const name = new Map();
for (const el of readdirSync(new URL("resonators/", R))) {
  for (const f of readdirSync(new URL(`resonators/${el}/`, R)).filter((f) => f.endsWith(".js"))) {
    const mod = await import(`${R}resonators/${el}/${f}`);
    for (const [k, v] of Object.entries(mod)) if (v?.constructor?.name === "Loadout" && !name.has(v)) name.set(v, k);
  }
}
console.log(JSON.stringify(teams.ALL_TEAMS.map((t, i) => [i, t.loadouts.map((l) => name.get(l) ?? "?")])));
