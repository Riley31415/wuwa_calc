// node vdump.mjs <team index | A,B,C> <picks json|-> : runTeam with every member's other main stats as variants
import { team, solver, tr } from "./members.mjs";
const [index, picksArg] = process.argv.slice(2);
const { key, members, picks, combo } = await team(index, picksArg);
const alts = members.map((m, i) => m.loadout.mainstats.map((_, k) => k).filter((k) => k !== picks[i].mainstat));
const variants = alts.map((a, i) => a.map((k) => solver.comboOf(members[i].loadout, { ...picks[i], mainstat: k })));
const run = tr.runTeam(key, members, combo, false, variants);
console.log(JSON.stringify({ total: run.total, sections: run.sectionTotals, variants: run.variantRuns.map((vs) => vs.map((v) => [v.total, v.sectionTotals, v.unsafe])) }));
