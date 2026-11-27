# Transition system rework: handoff

The engine is partway through replacing hand-written cancel tags (`.cancel()`, `.instaDash()`, `.holdCancel()`, ...) with a
**transition system**. A rotation writes only a press's intended **timing**; the engine finds the cut into the next written
press by watching the fight frame by frame. This file is the state of that work and what is left. Read `CLAUDE.md` first
(its rules hold: never commit, LF newlines, 1–2 line comments, don't read `TODO.md`; this engine work was explicitly
requested by the user). `docs/engine.md` describes the engine itself; parts of it still describe the old system (see
"Left to do").

## The rules (decided by the user, treat as fixed)

Frames are 60fps. `INPUT_PRECISION` (P) = 10, `HOLD_BUFFER` (HB) = 12 (`stats.ts`, `Delays`). `MASH_SPEED` was removed.

**Timings** (`Timing`, written on a rotation step):
- nothing written = **last commit** (the default; `.lastCommit()` has been deleted from every kit, it does nothing extra)
- `.instant()` aims at frame 0; `.firstHit()` at the first bullet's hit; `.timed(n)` cuts exactly at frame n
- the target of last commit is the press's last bullet commit (`cutFrame`)

**Compile-time refusals** (`timingProblem()`, rotation.ts):
- instant where the last commit is at frame ≤ P → "leave it at last commit"
- otherwise instant where the first hit is at frame ≤ P → "write .firstHit() instead"
- first hit with no bullets; timed with a non-whole or negative frame; a timed hold with n < HB

**Run-time refusals** (`decideCut()`): a non-last-commit cut landing at or past the last commit → use last commit; an
instant cut landing past the first hit (first hit > P) → use first hit. Swaps are exempt.

**Available vs castable**: *available* = every condition of the press holds and no higher-`inputPriority` press on its
input has its own conditions met (a tie throws). *Castable at f* = available, and the current press's priority,
transform and no-swap frames let it out at f.

**Cut rules** (`cutsAt()`, evaluate.ts), the first frame f ≥ target that qualifies:
- **precise**: the next press is castable on every frame from f − P to f, with f − P ≥ target. For instant, the aim at
  frame 0 only needs it *available*. This is the only way into a **swap** (a SWAP, or an Outro with no animation).
  So a swap lands P after it opens (no-swap frames ending, Concerto banked...).
- **buffered** (never a swap): castable at f, not castable on any of the P frames before f (from the cast on, f − P ≥ 0),
  and its input gives no *other* press during those frames (mash safety). The buffered press comes out the frame it opens.
- **held input** (the next press is a hold): pressed P + HB before it comes out, no earlier than P + HB before the target,
  and no earlier than P frames before the current press's cast. So it is out at the first castable frame ≥ max(target, HB).
  There is **no tap check** (what the tap would give doesn't matter).
- taps can NOT buffer through the frames before the current press's cast: buffering in those frames is what casts the
  current press itself.
- there is no "play it out" timing and none is wanted: from the animation's last frame nothing the press holds keeps
  the next press out, so last commit buffers into the next press on the last frame; to let a late bullet land, write a
  later precise timing (`.timed(n)`).

**A press's end**: a watched press ends (its `afterAction`, the chain update) where its animation runs out, or at its cut
if that comes sooner (`queueEnd(..., watched)`).

**Gauges** gain when a bullet *hits*, not when it commits (a commit only means the projectile is in the air).

**DASH / JUMP** are presses like any other, watched at last commit (their last commit is frame 0, so they cut P on, or
where the next press opens). `dashFor()` gives the member's own valid dash, else the plain one if they declare none;
**no fallback**: with none valid it resolves to `NO_VALID_DASH` / `NO_VALID_JUMP` (never castable ahead, throws where
reached). A DASH/JUMP written right after a skipped press (`SKIP`, an echo not worn) is skipped with it.

**Tune Break**: a watched press's break (taking a written DASH's place, or ahead of the next press) comes out at the cut
only where the press's own timing would bring the break out there (`cutsAt()` over the break's per-frame readiness).

## How it works now (map)

`src/engine/evaluate.ts`:
- `run()` (~993) builds steps (`Step.timing`, `Step.source` = the rotation entry) and plays them. A mover's press with
  no old cut (`kind === Transition.Temporary`) that splits and animates opens a watch: `openWatch(..., step.timing ??
  LAST_COMMIT, step.source)`.
- `TransitionWatch` / `openWatch()` (~1968): resolves the next written press as if this press were the last one (`asNext`),
  takes the resolver of the step it really reads (past `castsWithNext` echoes) to re-resolve each frame, and sets a
  horizon. `settleTransition()` (~2022) runs at the top of `walk()`; while a watch is open the walk steps one frame at a
  time. `recordFrame()` (~2076) reads available / castable / mash-safe (against `owner.lastPress`, i.e. the chain as
  the cast left it, `chainAs()` honoured) and the Tune Break's readiness (`breaks`). `decideCut()` (~2108) +
  `cutsAt()` (~2136) pick the cut; `applyCut()` (~2154) trims the clock, drops uncommitted bullets (not for swaps),
  moves the end, writes `row.cutAt`, records `state.playedCuts`, runs the Tune Break's `atCut` with `open` decided
  by `cutsAt()`. No frame by the horizon → throws (`whyNoCut()` ~2049 explains why).
- `queueEnd()` (~1659): end entry at the animation's end for watched presses.
- Old-tag shadow check, still present: `TRANSITION_CHECK` (~1890: `on`, `found`, `trace`/`traced` per-frame traces
  of the predictive solve, `rows` every played row), `checkTransition()`, `timingOfOld()`, `solveCut()` (~2212,
  predictive, misses hook gains). With no old tags left in kits it only sees engine-internal cuts.
- `oldCutFor()` (~2197) / `drivenAs`: the old `Transition` label a watched cut stands for. Still read by the Tune Break
  machinery (`TAKEN_CUTS`, `STEP_CUTS`, `dashTaken()` ~1525, `cutTaken()` ~1543, `atCutCheck()` ~1724).

`src/engine/rotation.ts`:
- `timingProblem()` (~1352), `TimedStep`/`StepTiming` (~1331), `withTiming()`.
- Planner: `chainGates()` (~1658) plans a visit ahead (an Outro's wait for the next visit's cooldowns). A watched press
  is planned at the cut it last played this fight (`state.playedCuts`, keyed by rotation entry), else as the old cut its
  timing stands for (`PLANNED_CUT`, `PLAN_LAST_COMMIT`), or, into a held press, where that press can follow it
  (`holdPays`/`freeForNext` from `timingTarget()`). The planner is a heuristic and can't know a watched cut; it has
  swung scores up to ±9% when wrong.
- `dashFor()` (~1286), `NO_VALID_DASH`, `NO_VALID_JUMP`.
- `cancelCost()` (~246) still costs old tag kinds.
- Old cut methods still defined (no kit uses them): `cancel`, `instaCancel`, `mashCancel`, `holdCancel`, `hitCancel`,
  `cancelAt`, `swapCancel`, `instaSwap`, `mashSwap`, `hitSwap`, and `letGo`/`holdAt`/`holdPays` for the old hold path.
  The dash/jump cut methods (`dashCancel`, `instaDash`, `hitDash`, ...) and `DashMarker` are already deleted.

Elsewhere: `state.ts` (`playedCuts`), `gear.ts` (`atCut?(behind, cut, open?) => boolean | void`),
`src/resonators/tunebreak.ts` (`BREAK_AFTER`, `BREAK_CUTS`, `atCut` returns readiness and honours `open`, `takesCut`,
`breakReady()`), `src/page/display.ts` (tag box from `cutAt` + `nextInput`), `stats.ts` (`Transition` enum: old kinds
still exist, `KIND_OF`, `VIA_OF`).

## State of the kits

- No old cut tag is live in any kit. Only commented lines remain: `electro/hsin.ts` ~1004-1007, `glacio/suisui.ts` ~615, ~627.
- Kits write `.instant()`, `.firstHit()`, `.timed(n)`, bare `DASH`/`JUMP`/`SWAP`; unwritten = last commit.
- Conversions done (old → new): dash cancel → `X, DASH`; instant jump → `X.instant(), JUMP`; hit dash → `X.firstHit(), DASH`;
  jump cancel → `X, JUMP`; hold cancel → `.instant()` ("cancel asap"); mash cancel → `.instant()`; instant cancel →
  `.instant()`; instant dash → `X.instant(), DASH`; hit cancel → `.firstHit()`; plain cancel → last commit. Where a
  timing was refused, the refusal's advice was applied.
- Cantarella's `CANTARELLA_MDPS` loadout is commented out (user), and dropped from the `teams.ts` import.
- `src/explorer/skbench.ts` and `src/explorer/lilysearch.mjs` still call deleted dash methods; the user will update them
  later. `tsc` reports 3 errors in `skbench.ts`; it still emits.

## Left to do

1. **Rotation errors since last commit became the default** (teams that throw; counts as of the last run). The old
   engine cast these with only a "cast where it isn't valid" warning:
   - Shorekeeper (117 teams): `BA12.firstHit()`/`BA2.firstHit()` into Illation, which needs 5 Forte; she has 4.
     Cause not yet found; her Basic hits all commit by their last commit.
   - Sanhua (36): Detonate → Outro, short of Concerto.
   - Cantarella (27): Perception Drain → Outro, short of Concerto (99.93).
   - Jingran (24): Stardome Meander → Encroaching Yin never available (holds Yin Vessel, grounded).
   - Brant (17): two dashes mid-air; the air-dash lockout (`NO_AIR_DASH`) leaves no valid dash for the second.
   - Brant (11): Captain's Rhapsody 3 → Returned from Ashes castable only on frames 75-78, never 10 frames running.
   - Camellya (4): Floral Ravage `.instant()` → Outro (Ephemeral) never available.
   - Unrelated to cuts: Zhezhi can't fill her Energy bar in one build (t753); Electro Rover has a stat hook that changes
     the fight.
   The user hasn't decided yet whether they fix these rotations or want proposals.
2. **Tune Break integration** (user asked: integrate it with the transition system, simplify, find earlier valid
   spots). Proposed: drop the old-label hooks (`oldCutFor`, `BREAK_CUTS`, `STEP_CUTS`, `TAKEN_CUTS`, `dashTaken`,
   `cutTaken`, `READY_AT_CUT`); the watch treats the break as a candidate press each frame; where the press's timing
   would bring the break out before the next press, cut there, play the break, then the next written press. Not started.
3. **Remove the old system**: the old cut methods and their overrides, the old `Transition` kinds, `cancelCost`'s tag
   kinds, the old hold watch (`HoldWatch`, `settleHold`, `letGo`), `oldCutFor`/`drivenAs`, the predictive check
   (`TRANSITION_CHECK`, `solveCut`, `checkTransition`, `timingOfOld`, `openTransition`). Do this after the Tune Break
   no longer reads old labels.
4. **Untraced score moves**: mash conversion (Buling / Havoc Rover −5.5%), instant conversion (Baizhi / Lupa / Brant
   −6.1%), plain cancel conversion (Lynae teams down to −4.9%), last commit default (Cartethyia teams down to −10.9%,
   some Galbrena / Xiangli Yao / Phoebe teams up to +9.9%).
5. **docs/engine.md**: its transitions section still describes the old tags and calls the system "being verified";
   rewrite it for the new system once the old one is gone.
6. **Explorer tools** (`skbench.ts`, `lilysearch.mjs`): the user will update them to the new engine.

## Verifying a change

Build: `"/c/Program Files/nodejs/node.exe" node_modules/typescript/bin/tsc -p .` (output in `dist/src`). Scripts load
`dist/src/resonators/teams.js` and `dist/src/solve/solver.js` (`ALL_TEAMS`, `teamKey(i)`, `teamFromKey`, `solveTeam(key,
team, defaultFilters(), null).scores[0]` with `total` and `bySlot`). Silence `console.warn` while solving; it logs
"cast where it isn't valid" and the like.

The scripts used so far lived in the session scratchpad and may be gone; each is short to rewrite:
- **error list**: solve every team, count distinct first-line error messages (a team stops at its first error).
- **baseline save/compare**: dump every team's `JSON.stringify(scores)` or `ERR ...` to JSON. Team keys `tN` shift when
  the team list changes, so compare by member names (`bySlot` names), not by key.
- **row dump**: turn on `TRANSITION_CHECK.on`, solve one team, print `TRANSITION_CHECK.rows` (start, member, press,
  `cutAt`, `avg`) after the last reset (`starts` dropping by > 600 marks a new solve pass).
- **two-version compare**: copy `src/resonators` aside, swap in the old kits, build, run, swap back, build, diff.
- **kit conversions**: regex over non-comment lines of `src/resonators/**`; then a loop that loads the kits and applies
  each compile refusal's advice to the named press's constant (and groups ending with it; echoes live in
  `src/echoes`), and another that solves all teams and applies each run-time refusal's advice. Presses whose constant
  can't be found by name (`X.variant(X.name, ...)`, `Intro.inLastSlot()`, an Intro entry resolving to another form)
  need fixing by hand.
- **debugging a watch failure**: temporarily append to the throw in `settleTransition()` the per-frame record
  (`w.castable`, `w.available`, `w.mashSafe` as strings, `w.next.name`, `w.owner.lastPress`, gauges), run the one
  failing team, then restore the file.
