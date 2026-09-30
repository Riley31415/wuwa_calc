# Rust port — where it stopped (2026-09-30)

Paused by the user's call: the site stays on the TS engine, and the TS engine gets the speed work instead.
This file records the state so the port can be picked up again. PORT_PLAN.md has the plan and layout,
and PORTING.md is the guide for porting a kit.

## Working
- **Engine:** everything in `rust/src`.
  - Covered: gear/acts/pools, the full context API, the rotation compiler and scheduler, loadouts, the
    runTeam ER loop, variants, tracing, and the JSON API (`wasm_api.rs`).
- **Website on wasm:** `src/engine/wasm.ts`, the mirrors in `src/mirror/`, and `src/worker.ts`, which
  posts `ready` before the page sends work.
  - Verified in Chromium: the table and detail page match TS line for line on Mornye/Rebecca/Lucy.
  - The node solve is byte-identical to TS.
- **Gear:** every weapon file (broadblade, gauntlet, pistol, rectifier, standard, sword) and every echo
  file (jinzhou, lahairoi, mengzhou, rinascita, septimont). All are registered under their TS export
  names.
- **Kits:** Mornye, Rebecca, Lucy.
- **Idioms:** definition structs take plain defaults instead of `Some`/`None`. See PORTING.md.

## Verified exact
Checked on trace, variants and traced output:
- Mornye/Rebecca/Lucy across sequences, refines, weapons 0-2, every echo loadout, and main stats,
  with `.m`/`.h`.
- The gear no current team uses was only line-ported. The weapons_a agent also ran its 26 weapons
  through a scratch team, and all were exact.

## Not done
- **Kits:** 47 kits are unported. The kit agents (`rust_work/kits_a..i/`) were stopped by the rate limit
  before writing anything, so those workspaces are bare copies and can be deleted. Grouping used:
  - a: hsin, hiyuki, denia
  - b: phrolova, cantarella, augusta, aemeath, chisa (phrolova first; the other two import from it)
  - c: suoming, xuanling, suisui, camellya
  - d: qingxiao, cartethyia, jinhsi, luuk, sigrika
  - e: jingran, lucilla, lupa, lynae, phoebe
  - f: galbrena, zani, qiuyuan, brant, rover_electro, jiyan
  - g: buling, yinlin, iuno, roccia, danjin, carlotta, zhezhi
  - h: rover_aero, shorekeeper, mortefi, xiangli_yao, ciaccona, changli
  - i: verina, jianxin, sanhua, encore, rover_havoc, rover_spectro
- **Checks and cleanup:**
  - Roster-wide verification: `harness/verify_all.py rust` has covered 1 team so far.
  - Per-team timing: `harness/speed.mjs` has not been run yet.
  - Scratch to delete: `rust_work/weapons_a/xcrate` and `hx`, and the gear agents' workspaces (already
    merged).
- **If resumed:** `harness/ts_ref` is frozen at the port's start. Diff it against the live `src/` and
  port the kit changes made since.

## Numbers so far (Mornye/Rebecca/Lucy)
- runTeam per call: native Rust 0.81 ms, node16 wasm 1.67 ms, node16 TS 4.45 ms, Chromium wasm about
  1.1 ms, Chromium TS 2.9 ms.
- Whole-team solve in node: wasm 202 ms against TS 730 ms.

## Commands
- `cargo build --profile quick` (about 15s), then `python harness/check.py . A,B,C [picks]`.
- `python harness/verify_all.py .` for the roster.
- `python build_wasm.py` → dist/engine.wasm.
