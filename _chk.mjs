globalThis.document = {};
const { ALL_TEAMS } = await import("./dist/src/engine/teams.js");
const { runTeam, member } = await import("./dist/src/engine/solver.js");
const { buildReport } = await import("./dist/src/engine/display.js");
let ampSeen = 0, resSeen = 0;
for (const t of ALL_TEAMS) {
  const m = t.loadouts.map((l, i) => member(l, i === t.dpsIndex));
  const c = m.map((x)=>({weapon:x.loadout.weapons[0],echo:x.loadout.echoLoadouts[0],mainstat:x.loadout.mainstats[0],sequence:0,key:"x"}));
  let run; try { run = runTeam("x", m, c, true); } catch (e) { continue; }
  const rep = buildReport(run.rotationLines.flat(), run);
  const all = []; for (const r of rep.rows) { all.push(r); for (const p of r.parts) all.push(p); }
  const who = t.loadouts.map(l=>l.resonator.name).join("/");
  for (const r of all) {
    if (r.scaling === 3 && Number(r.raw.amp) > 0 && ampSeen < 3) {
      ampSeen++;
      console.log(`DOT amp ${who} | ${r.raw.action} amp=${r.raw.amp} src=${(r.sources.amp||[]).map(x=>`[${x.section??"-"}] ${x.source}=${x.value}`).join(", ")}`);
    }
    if ((r.sources.effRes||[]).length && resSeen < 4) {
      resSeen++;
      console.log(`RES ${who} | sc=${r.scaling} ${r.raw.action} res=${Number(r.raw.effRes).toFixed(1)} src=${r.sources.effRes.map(x=>`[${x.section??"-"}] ${x.source}=${x.value}`).join(", ")}`);
    }
  }
  if (ampSeen >= 3 && resSeen >= 4) break;
}
console.log("done", { ampSeen, resSeen });
