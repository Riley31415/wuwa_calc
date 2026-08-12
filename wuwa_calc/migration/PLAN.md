# overview

we are migrating my google spreadsheet calculator for the game wuthering waves
into a locally hosted website. the web interface will feel similar to google sheets in some ways,
but will have extended funcitonality
all calculations will be done in javascript
we need to be able to store all of the game data previously stored in the sheets as local files
they will be editable in the web interface as well

# in order to perform a calculation
choose up to 3 resonators for the team
pick up to N rotations for each resonator in the team.
typically this will be an opener + 3 identical loops so N=4, but in the spreadsheet we only use N=1
each rotation has a list of actions to take
each actions attributes decide which stats effect it
each action also has energy, concerto, offtune, forte, 
etc which are just numbers to display to the user when they are creating and editing rotations
each resonator has a list of gear
each piece of gear has stats and exports stats to the team, next resonator, last resonator, etc

# first step — DONE
"old.xlsx" contains the downloaded spreadsheet.
use it to gather the old data and identify data fields and layouts
we will be reducing the number of stats by creating a new tag system for the resonators and teams
not just copying 1 to 1

figure out what each part of the sheet is doing, 
and figure out which sheets may not be needed (usually the ones with all caps names)

**Results in [FINDINGS.md](FINDINGS.md).** Every formula was recovered, the full damage
pipeline is documented, and all 19 sheets are triaged. Headlines:

- 11 of 19 sheets are throwaway scratch, but **`TUNEDOT` is real data** (per-level dot/tune
  constants; `Config`'s two magic numbers are just its level-90 row) and **`TUNETEST` is a
  test suite** (65 observed in-game damage numbers that validate the def/res formula).
- The engine is one big column-per-stat pipeline in `Calculator`; **column order is the
  topological evaluation order**, and scalers may only reference columns `R:BF`.
- **Only 19 of 44 "stats" are real stats.** 19 more are counters/gates that exist purely
  because a spreadsheet needs a column per intermediate — that is the reduction target.
- **Biggest hazard: case collisions.** Sheets' `MATCH` is case-insensitive, so ~800 tag
  values disagree on capitalisation (`atk`/`ATK`, `aero`/`Aero`, `basic`/`Basic`, …) and
  work anyway. A JS `===` port silently drops those buffs with no error.

---

# decided

**Tag system: parity first, redesign second.** Extract 1:1 with tags normalised, port the
engine, prove it against `TUNETEST`, *then* split the vocabulary into stat / resource /
flag namespaces on a green test suite. The redesign still happens — it just isn't also the
thing being debugged.

Still open, all deferrable:
- Promote `Node` to a real tag, or keep it display-only? (Currently dead — FINDINGS ②.
  Careful: promoting it *changes results*, since `Stats.type: "skill"` would start matching
  `node: "skill"` actions too. Do it after parity, not before.)
- Drive the on-field window off the `intro`/`outro` **tags** instead of substring-matching
  action names? (Recommend yes — FINDINGS §3 step 2)
- Auto-generate `<Resonator> S<n>` sequence rows? (Recommend yes; kills a whole bug class)

---

# next steps

## 2. lock the data model — DONE
Schemas for all 8 files documented in [data/README.md](data/README.md).

## 3. extract to local files — DONE
`python tools/extract.py` → `data/*.json`, idempotent. 308 gear, 1051 actions, 1459 stat
modifiers, 69 rotations, 208 builds, 209 teams, 90 level rows.

It validates as it goes and refuses to write on a hard error: every tag is checked against
its `Config` enum, every stat name against the stat vocabulary, and every cross-reference
(rotation→action, build→gear/rotation, team→build) is resolved. Tags are lowercased, gear
names are not, `Offtune` is divided by 10000, and all derived columns are dropped.

It also adopts the **51 action rows** the sheet excluded via its sparse `Rotations` column
A. All 51 are 0% MV (mostly `Outro`), so that exclusion was a speed optimisation, not a
bug — damage is unchanged and the resource totals become whole. FINDINGS ⑥.

Smaller items it caught, all recorded in FINDINGS ⑦: duplicate `Gear` rows
(`Void Thunder 2pc`, `Celestial Light 2pc` filed as both Sonata and 2pc), a duplicate
`Iuno: MA2` action, two duplicate team names, and `midair` used as a Special without ever
being declared in `Config`.

## 4. the engine — IN PROGRESS
See [engine/README.md](engine/README.md). Gear is **code, not data**: a buff is a named
function that applies stats, organised one file per resonator. `data/stats.json` is now the
source material you port from, not the runtime input.

This supersedes the "parity first, then redesign" decision above — the buff system was
reworked directly (TODO.md), so the tag-filter column is gone rather than ported.

Done: `State`/`Slot` with the three buff-delivery mechanisms, the ambient authoring
namespace, `LATE` priority for conversion passives, simulated resources and the action
queue, the damage formula, `baseline`, and `Jingran` end to end. 27 tests green.

Deliberate divergences from the sheet, both sanctioned:
- Jingran's shield stacks are simulated — every action grants one — instead of the sheet's
  hand-authored per-action value, so his numbers will not match.
- `node` is still not resolved as a scoped damage bonus. Decide before adding gear that
  grants "Liberation DMG +x%", since Lib1 is node `liberation` but type `heavy`.

Next: the remaining resonators, then teams of three (only slot 1 is exercised so far).

## 5. validate against ground truth
`TUNETEST`'s tune-break observation (64343) is reproduced exactly by `damage()`. The other
64 fixtures in that sheet are still unported — they cover def shred, bane and ignore
combinations, which is the cheapest remaining confidence win.

Team-level DPR diffs are a weak signal: only **1 of 209 teams is enabled**, so nearly every
`sheetDpr` value is a stale hand-typed fallback (FINDINGS ⑧). And with shields now
simulated, Jingran will not agree with the sheet by design.

## 6. build the UI
Deleted the first sheet-like editor at your request; the final site is a team / build /
rotation editor plus a results viewer. Worth rebuilding early: the old `Buffs` inspector,
i.e. "which buffs hit this stat for this action, and why" — `run.js --entries` already
prints exactly that, attributed per source, so it is the model to put behind a UI.

## 7. extended functionality
- N rotations per resonator (opener + 3 loops); the sheet only does N=1
- the "adaptive" mainstat solver from the TODO sheet
- team validation rules

---

# deferred (from the old TODO sheet)
Full triage in FINDINGS.md §7. Data entry and renames to fold into extraction:
`bullets sheet`, `add bell`, `rover sequences`, `lib buff`, `augusta specialenergy2 max`,
`apply to dot tag`, `link mainslot to echo cast`, action-name conventions
(`prefix`→`form`, `frolo`→`FHA`, →`UBA`), `MV`/`MVbase` rename,
`action0-11` → semantic buff IDs.

Note: "rename res shred and def shred to reduce" — careful, `defShred` and `defReduce`
are **already semantically different** (`defShred` is gated by `notDot`, `defReduce` is not).
