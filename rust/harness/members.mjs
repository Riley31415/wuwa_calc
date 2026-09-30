// the reference's team for a dump: a roster index, or three loadouts named by their TS export
import { readdirSync } from "node:fs";
globalThis.self = globalThis;
export const R = new URL("./rref/src/", import.meta.url).href;
const teams = await import(R + "teams.js");
export const solver = await import(R + "solver.js");
export const tr = await import(R + "teamrun.js");

async function byExport() {
  const out = {};
  for (const el of readdirSync(new URL("resonators/", R))) {
    for (const f of readdirSync(new URL(`resonators/${el}/`, R)).filter((f) => f.endsWith(".js"))) {
      const mod = await import(`${R}resonators/${el}/${f}`);
      for (const [k, v] of Object.entries(mod)) if (v?.constructor?.name === "Loadout") out[k] = v;
    }
  }
  return out;
}

/** @returns the team key, its members and the combo for `picksArg` (JSON, or "-" / absent for zeros) */
export async function team(index, picksArg) {
  let key, members;
  if (/^\d+$/.test(index)) {
    key = teams.teamKey(+index);
    members = solver.teamFromKey(key);
  } else {
    const named = await byExport();
    key = "x";
    members = index.split(",").map((n) => {
      if (!named[n]) throw new Error(`no loadout ${n}`);
      return solver.member(named[n]);
    });
  }
  const zero = { weapon: 0, echo: 0, mainstat: 0, sequence: 0, refine: 0, matrix: false, highSubs: false };
  const picks = picksArg && picksArg !== "-" ? JSON.parse(picksArg) : members.map(() => zero);
  const combo = members.map((m, j) => solver.comboOf(m.loadout, picks[j]));
  return { key, members, picks, combo };
}
