// node dump.mjs <out.json> <team index | LOADOUT,LOADOUT,LOADOUT> [picks json] — reference trace and totals
// for one roster team, or for any three loadouts named by their TS export
import { writeFileSync } from "node:fs";
import { team, tr } from "./members.mjs";
const [out, index, picksArg] = process.argv.slice(2);
const { key, members, picks, combo } = await team(index, picksArg);
tr.runTeam(key, members, combo, false);
globalThis.__tr = [];
const run = tr.runTeam(key, members, combo, false);
const trace = globalThis.__tr;
globalThis.__tr = undefined;
const rolls = tr.erRollsFor(key, members, combo);
writeFileSync(out, JSON.stringify({ key, names: members.map((m) => m.name), picks, rolls, sections: run.sectionTotals, frames: run.seconds * 60, trace }));
console.log(key, members.map((m) => m.name).join("/"), rolls, run.sectionTotals, run.seconds * 60, trace.length);
