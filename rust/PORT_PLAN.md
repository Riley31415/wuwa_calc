# Rust engine port — plan and state

End state (user's call, 2026-09-29): Rust is the only engine. Kits are authored in Rust; the wasm
module runs every fight (bulk solver runs and the traced detail run) and exports the metadata the
UI reads. The TS UI (page/*, display.ts, solver.ts search, teams.ts roster) stays TS but works on
plain mirror objects the wasm module hands over. The TS engine and TS kits are deleted at the end.

## Boundary
- wasm exports JSON-in/JSON-out calls: `meta()` (every loadout, gear, action the UI names),
  `run_team(req)` (untraced scores + variant runs, or the traced report data), `playable(...)`.
- TS mirror objects keep the field names the UI already reads (Gear.name, Loadout.weapons, ...), so
  page/* changes little. Loadouts are named by their TS export (`SHOREKEEPER`) so teams.ts keeps
  its roster table.
- node 16 can't load the wasm (reference-types encoding); precompute needs another host
  (headless Chromium, the native binary, or a newer node).

## Order
1. Engine: full context API, gear shapes (Resonator/Weapon refinements/Mainslot/Sonatas/Matrix/
   Mode/handoff/coordinatedBuff), mainstats/substats builders, Loadout, rotation compiler + full
   scheduler + teamPlayable, variants, ER window/ER_SHORT, teamrun (runTeam ER loop, lines, sums),
   tracing.
2. Website: wasm bridge + mirrors, teams/solver/page on mirrors, workers, dev.py/bundle.
3. Kits: shared statuses/unison, weapons, echoes, then every resonator; verify every team.

## Verification
Parity is exact equality — no tolerance: per-evaluate traces (see Harness) and totals. Timing: TS
vs wasm per team in Chromium, and native.

## Harness (rust/harness/, never the temp scratchpad — it gets wiped between sessions)
- `ts_ref/`: the TS tree frozen at the start of the port, the reference every port is checked
  against. `build_ref.sh` compiles it into `rref/` with a trace hook (patch_ref.py).
- `dump.mjs <out> <team> [picks]`: TS trace + totals. `rcmp.py <ref> <rust trace>`: first row that
  differs. `vdump.mjs`: runTeam with every other main stat as a variant. `cases144.sh`: t144 over
  six builds.
- `cargo build --release` then `target/release/harness.exe --members=A,B,C --picks=w.e.m.sS.rR[.m][.h],...
  [--trace|--variants|--n=N]`.

## Layout (rust/src/)
- eng.rs core (gear, acts, pools, stacks, ticks, API core), api.rs (rest of context.ts), run.rs
  (evaluate incl. variants/ER window, run, damage), rotation.rs (forms, compiler, scheduler),
  loadout.rs (Loadout, mainstats/substats), authoring.rs (Resonator/Weapon/Mainslot/sonata/
  handoff/coordinated builders), teamrun.rs (runTeam ER loop, lines, sums, variantSums).
- kits/: shared.rs (status+tunebreak+unison), weapons/, echoes/, resonators/ — registered in
  `Lib` by TS export name. `lib.todo_w`/`todo_g` stand in for gear not ported yet (named
  "(not ported)", listed in `lib.pending`) so loadout indices still match TS.

## Done
- Engine core, generic rotation compiler/scheduler, loadouts, runTeam ER loop, variants, tracing,
  the wasm JSON API (`wasm_api.rs`), and the website on it: `src/engine/wasm.ts`, the mirrors in
  `src/mirror/`, and workers (`src/worker.ts` posts `ready` once the engine has loaded).
- Every weapon and echo file. The kits Mornye, Rebecca and Lucy.
- Definition structs take plain defaults, not Options (see PORTING.md's Idioms).
- Build: `python rust/build_wasm.py` → dist/engine.wasm; `npm run build` runs it, and dev.py rebuilds on
  .rs changes (logs/wasm.log).
- Checks:
  - `harness/check.py <crate> A,B,C [picks]` checks the trace, the variants and the traced run.
  - `harness/verify_all.py <crate>` runs every roster team the crate covers, over 3 builds.
  - `harness/speed.mjs` times each team in a tree.

## In flight
- The remaining 47 kits, ported by agents in `rust_work/kits_[a-i]/`, then merged here.

## Not yet
- Verify every roster team (verify_all), and TS vs wasm timings per team (node + Chromium).
- Move CLAUDE.md's kit rules to the Rust idiom. Delete the TS engine and kits (needs the user's go-ahead).
