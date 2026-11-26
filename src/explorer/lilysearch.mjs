// Lily's three rotations re-searched (argv[2]): "opener" (solo, Basic 1 first, one Skill), "first" (her first
// arrival on First Bloom, one Skill: Shorekeeper / Lily, one rotation) or "loop" (Eternal Bloom, no Skill: Lily /
// Shorekeeper, three rotations, both loop visits timed). Each string runs to 300 Dream Perfume and stops, then the
// kit's own close: Woven Phantasm (hold), Phantasm's End (cancel), the echoes' insta cuts, Liberation (swap cancel), Outro
const mode = process.argv[2] ?? "opener";
const dist = new URL("./build/src/", import.meta.url).href;
const load = (f) => import(new URL(f, dist).href);
globalThis.self = globalThis;
const { setDelays } = await load("engine/stats.js");
const num = (k) => (process.env[k] === undefined ? undefined : +process.env[k]);
setDelays({ precision: num("PRECISION"), mash: num("MASH") });
const solver = await load("solve/solver.js");
const teamrun = await load("solve/teamrun.js");
const display = await load("page/display.js");
const lily = await load("resonators/spectro/lily.js");
const { SHOREKEEPER } = await load("resonators/spectro/shorekeeper.js");
const A = lily.__A;
let warns = [];
console.warn = (...a) => warns.push(a.join(" "));
const gen = (s) => display.landedBullets(s).reduce((n, b) => n + b.energy, 0) + Math.max(0, s.action.castEnergy);

const pick = { weapon: 0, echo: 0, mainstat: 0, sequence: 0, refine: 0, matrix: false, highSubs: false };
const members = mode === "opener" ? [solver.member(lily.LILY, true)] : mode === "eternalft" ? [solver.member(lily.LILY, true), solver.member(SHOREKEEPER)]
  : mode === "first" ? [solver.member(SHOREKEEPER), solver.member(lily.LILY, true)]
  : [solver.member(lily.LILY, true), solver.member(SHOREKEEPER)];
const combo = members.map((m) => solver.comboOf(m.loadout, pick));
const sections = mode === "loop" ? 3 : mode === "eternalft" ? 2 : 1;

// FORM=fairytale plays the slow heavy instead: no Skill anywhere, so she never leaves Fairytale form
const fairy = process.env.FORM === "fairytale";
const B = lily.__B;
const TAIL = () => [fairy ? B.WovenFairytale.holdCancel() : A.WovenPhantasm.holdCancel(), fairy ? B.FairytalesFinale.cancel() : A.PhantasmsEnd.cancel(),
  A.FALLACY.instaCancel(), A.FORMRENDER.instaCancel(), A.SPACETREK_EXPLORER.instaCancel(), A.Liberation.mashSwap(), A.Outro];
// the kit's own chains, each replaced by the candidate where it is the one searched
const KIT = {
  opener: fairy ? [A.SWAPIN, A.BA1, A.BA2, A.BA3, A.BA4, ...TAIL()] : [A.SWAPIN, A.BA12.cancel(), A.NightmareBlend, A.BA1, ...TAIL()],
  // "eternalft": an opener with no Skill, so her next Eternal Bloom arrives in Fairytale form
  openerFairytale: [A.SWAPIN, A.BA1, A.BA2, A.BA3, A.BA4, B.WovenFairytale.holdCancel(), B.FairytalesFinale.cancel(), A.FALLACY.instaCancel(), A.FORMRENDER.instaCancel(), A.SPACETREK_EXPLORER.instaCancel(), A.Liberation.mashSwap(), A.Outro],
  first: fairy ? [A.IntroFirst, A.BA3, A.BA4, ...TAIL()] : [A.IntroFirst, A.BA3.cancel(), A.NightmareBlend, A.BA1, ...TAIL()],
  loop: [A.IntroEternal, A.BA3.jumpCancel(), A.MA, ...TAIL()],
};

// each press's Dream Perfume (her release kit's), for where a string reaches 300
const FORTE = { BA1: 49, BA2: 88, BA3: 72, BA4: 112, MA: 81, SK: 130 };
const ACT = { BA1: A.BA1, BA2: A.BA2, BA3: A.BA3, BA4: A.BA4, MA: A.MA, SK: A.NightmareBlend };
const CUT = { none: (a) => a, cancel: (a) => a.cancel(), dodge: (a) => a.dashCancel(), jump: (a) => a.jumpCancel(), hold: (a) => a.holdCancel() };
// a plunge only after a jump, a jump only into one, a dash breaks a Basic string, a plain cancel only into the
// Skill; the kit's own after/notAfter decide the rest (IE: the Intro)
function follows(X, P, c) {
  if (c === "jump") return X === "MA";
  if (X === "MA") return false;
  if (c === "cancel" && X !== "SK") return false;
  if (X === "BA2") return P === "BA1" && c !== "dodge";
  if (X === "BA3") return (P === "BA2" || P === "IE") && c !== "dodge";
  if (X === "BA4") return P === "BA3" && c !== "dodge";
  return true;
}
const wantSkill = mode !== "loop";
const cands = [];
function dfs(seq, forte, skill) {
  if (forte >= 300) {
    if (skill === wantSkill) for (const last of ["none", "hold"]) cands.push([...seq.slice(0, -1), [seq[seq.length - 1][0], last]]);
    return;
  }
  if (seq.length >= 8) return;
  const P = seq[seq.length - 1];
  for (const X of Object.keys(ACT)) {
    if (X === "SK" && (skill || !wantSkill)) continue;
    for (const c of ["none", "cancel", "dodge", "jump"]) {
      if (!follows(X, P[0], c)) continue;
      dfs([...seq.slice(0, -1), [P[0], c], [X, null]], forte + FORTE[X], skill || X === "SK");
    }
  }
}
// the opener swaps in on Basic 1; First Bloom banks nothing, Eternal Bloom 130
if (mode === "opener") dfs([["BA1", null]], FORTE.BA1, false);
else dfs([["IE", null]], mode === "first" ? 0 : 130, false);
console.log(`${mode}: ${cands.length} candidates`);

const intro = mode === "first" ? A.IntroFirst : mode === "eternalft" ? A.IntroEternalFT : A.IntroEternal;
function chain(seq) {
  const head = seq[0][0] === "IE" ? [mode === "first" ? CUT[seq[0][1] ?? "none"](intro) : CUT[seq[0][1] ?? "none"](intro)] : [A.SWAPIN, CUT[seq[0][1] ?? "none"](ACT.BA1)];
  return [...head, ...seq.slice(1).map(([x, c]) => CUT[c ?? "none"](ACT[x])), ...TAIL()];
}
const label = (seq) => seq.map(([x, c]) => `${x === "IE" ? "Intro" : x === "SK" ? "Skill" : x}${c && c !== "none" ? `.${c}` : ""}`).join(" → ");
const results = [], failures = new Map();
const t0 = performance.now();
for (const seq of cands) {
  const own = chain(seq);
  const r = new A.Rotation(mode === "eternalft" ? [...KIT.openerFairytale, ...KIT.first, ...own, ...KIT.loop]
    : [...(mode === "opener" ? own : KIT.opener), ...(mode === "first" ? own : KIT.first), ...(mode === "loop" ? own : KIT.loop)]);
  if (r.error) {
    failures.set(r.error.message.slice(0, 110), (failures.get(r.error.message.slice(0, 110)) ?? 0) + 1);
    continue;
  }
  lily.LILY.rotationByLevel = Array(7).fill(r);
  lily.LILY.rotations = [r];
  warns = [];
  let run;
  try {
    run = teamrun.runTeam(`lily3-${mode}`, members, combo, true, null, sections);
  } catch (e) {
    const m = String(e.message).replace(/\d+/g, "#").slice(0, 110);
    failures.set(m, (failures.get(m) ?? 0) + 1);
    continue;
  }
  const all = run.rotationLines.flat().map((l) => l.snap);
  const rows = all.filter((s) => !s.queued);
  // her visits, each to the press after her Liberation; the opener from frame 0; the duo's cooldown waits left out
  const visits = [];
  for (let at = 0; at < rows.length;) {
    if (rows[at].member !== "Lily") { at++; continue; }
    let k = at;
    while (k < rows.length && rows[k].member === "Lily") k++;
    const v = rows.slice(at, k), lib = v.findIndex((s) => /^Liberation/.test(s.action.name));
    if (lib >= 0 && v[lib + 1]) {
      const from = mode === "opener" ? 0 : v[0].frame, to = v[lib + 1].frame;
      let wait = 0;
      for (let j = 0; j < lib; j++) if (/^Wait/.test(v[j].action.name)) wait += v[j + 1].frame - v[j].frame;
      const energy = all.filter((s) => s.member === "Lily" && s.frame >= from && s.frame < to).reduce((n, s) => n + gen(s), 0) / 100;
      visits.push({ frames: to - from - wait, wait, energy });
    }
    at = k;
  }
  const mine = mode === "loop" ? visits.slice(1) : mode === "eternalft" ? visits.slice(1, 2) : visits.slice(0, 1);
  results.push({ seq: label(seq), visits: mine, frames: mine.reduce((a, v) => a + v.frames, 0) / Math.max(1, mine.length),
    warn: [...new Set(warns.filter((w) => /Lily:/.test(w)).map((w) => w.replace(/^\[.*?\] Lily: /, "")))].join("; ") });
}
results.sort((a, b) => a.frames - b.frames);
const clean = results.filter((r) => !r.warn && r.visits.length);
console.log(`${results.length} ran (${clean.length} clean), ${[...failures.values()].reduce((a, b) => a + b, 0)} threw, ${Math.round(performance.now() - t0)}ms`);
const show = (r) => `${(r.frames / 60).toFixed(2)}s  ${r.seq} | ${r.visits.map((v) => `${(v.frames / 60).toFixed(2)}s ${v.energy.toFixed(1)}E${v.wait ? ` (+${(v.wait / 60).toFixed(2)}s wait)` : ""}`).join(" / ")}`;
for (const r of clean) console.log(`  ${show(r)}`);
console.log("warned:");
for (const r of results.filter((r) => r.warn)) console.log(`  ${show(r)} | ${r.warn.slice(0, 150)}`);
console.log("throws:");
for (const [m, n] of [...failures].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(6)}x ${m}`);
const fs = await import("node:fs");
fs.writeFileSync(new URL(`./out/lilysearch_${mode}${fairy ? "_fairytale" : ""}.json`, import.meta.url), JSON.stringify({ results, failures: [...failures] }, null, 1));
