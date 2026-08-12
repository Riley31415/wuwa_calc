# old.xlsx — reverse-engineering notes

Source: `old.xlsx`, a Google Sheets export. Google-only functions (`LET`, `LAMBDA`,
`MAP`, `FILTER`, `SCAN`, `BYROW`, `XLOOKUP`, `TOCOL`, `MAKEARRAY`, `REDUCE`) survive
the export only as `__xludf.DUMMYFUNCTION("<source text>")` wrappers, but the source
text is intact, so every formula was recoverable. Cached values are preserved for the
static sheets; most `Calculator` cells cached empty, so the math below was read off the
formulas, not the values.

19 sheets, 4 layers: **vocabulary** (Config) → **data** (Gear, Stats, Actions,
Rotations) → **user selections** (Builds, Teams) → **engine + output** (Calculator,
Teams DPR columns, Distribution, Buffs).

---

## 1. Sheet inventory and disposition

| Sheet | Rows | Role | Migration |
| --- | --- | --- | --- |
| `Config` | 57 | Enum vocabulary + 5 global constants + derived dropdown lists | **Port** — becomes enums + settings |
| `Gear` | 310 | Flat registry of every buff-source: `Name, Category, Shorthand, Cost` | **Port** — data file |
| `Stats` | 1461 | **The buff database.** One row = one stat modifier | **Port** — data file (core) |
| `Actions` | 1052 | **The action database.** One row = one action + its tags | **Port** — data file (core) |
| `Rotations` | 866 | Ordered action lists, grouped into 69 named rotations | **Port** — data file (core) |
| `Builds` | 208 | Resonator + 9 gear slots + rotation | **Port** — user data |
| `Teams` | 234 | 3 build slots + computed DPR | **Port** — user data |
| `Calculator` | 861×99 | **The engine.** One row per action instance | **Reimplement in JS** — not data |
| `Buffs` | 24 | Live debug inspector: "which buffs hit this stat, for this action?" | **Reimplement as a UI panel** — very useful |
| `Distribution` | 29 | Per-slot DPR breakdown for one team | Reimplement as a view |
| `TUNEDOT` | 103 | **Real reference data:** level → dot base damage, tune rate | **Port** — data file |
| `TODO` | 17 | Your own task list | Fold into PLAN.md (see §7) |
| `TUNETEST` | 66 | Formula validation vs. 65 observed in-game damage numbers | **Keep as test fixtures**, then drop |
| `DEF` | 31 | Def-formula derivation scratch | Drop |
| `QX1-4` | 68 | Offtune → strain-stack derivation for Qingxiao comps | Drop |
| `STRAIN1-4` | 31 | Same, for Luuk comps | Drop |
| `FROLO1-5coda` | 75 | Phrolova coda/echo-cast counting scratch | Drop |
| `FROLO 2-5coda` | 75 | ditto (variant) | Drop |
| `FROLO 1-4coda` | 73 | ditto (variant) | Drop |

Your instinct in PLAN.md was right — the all-caps sheets are throwaway derivations,
with **two exceptions**:

- **`TUNEDOT` is real data**, not scratch. It is the only place the per-level dot/tune
  constants live. `Config!B4` (Dot Const 3674) and `Config!B5` (Tune Const 10027) are
  just the level-90 row hardcoded. Verified: `TUNEDOT` level 90 → dot `3674` ✓, and
  tune `10027 = 392000 × 0.025579218` (max offtune × level-90 tune rate). Port the
  whole table so enemy/resonator level becomes a real input instead of a magic number.
- **`TUNETEST` is a test suite.** It reverse-engineers the def/res formula against 65
  columns of observed in-game damage, and the guesses match observations to within
  ceiling rounding. Convert these to unit tests before deleting the sheet — they are
  the only ground truth that the damage formula is correct.

---

## 2. Field layouts

### `Config` — vocabulary
`A:B` are global constants: Enemy Level `100`, Resonator Level `90`, Default Res `0.2`,
Dot Const `3674`, Tune Const `10027`.

`C:M` are the enum lists. `O:W` are *derived* (`FILTER(Gear!A, Gear!B = <category>)`) —
they only exist to feed data-validation dropdowns and should not be ported as data.

| Col | Enum | Values |
| --- | --- | --- |
| C | Scopes | `Self, Team, Next, Last, Other` |
| D | Nodes | `normal, skill, forte, liberation, intro` |
| E | Scalings | `atk, hp, def, dot, tune` |
| F | Elements | `aero, electro, fusion, glacio, spectro, havoc, physical` |
| G | Types | `basic, heavy, skill, liberation, echo, intro, outro, status, break, rupture, hack` |
| H | Specials | `erosion, flare, burst, chafe, frazzle, coordinated` |
| I | Action IDs | `action0`–`action11`, `ruptureReact`, `hackReact`, `hecateEBA`, `hecateUBA12`, `chafeYuki`, `chafeMax`, `chafeNoYuki`, `burstMax`, `burstAmy1`–`3`, `burstNoAmy` |
| J,K,L,M | Stats / Scalers1-3 | the 44 stat names — see §5 |

### `Gear` — buff-source registry (310 entries, cols A:D only)
`Name, Category, Shorthand, Cost`. Categories: Weapon 56, Resonator 42, Mainslot 42,
Sonata 36, Mode 36, Mainstats 35, 2pc 26, Sequence 21, Substats 16.

"Gear" is a loose term here — it is the registry of **anything that can carry buffs**,
including the resonator itself, sequence level, and the abstract `Mode` rows
(`Xuanling 2f1a`, `Hiyuki 3 iai`) that select a playstyle variant. `Cost` is a budget
number (resonator 1.0, weapon ⅔, sequences 1–4) summed per build.

### `Actions` — action database (1052 rows, 53 sources)
| Col | Field | Notes |
| --- | --- | --- |
| A | Lookup | derived: `Source & ": " & Action` — the primary key |
| B, C | Source, Action | e.g. `Jingran`, `FSkill` |
| D | Multiplier | the motion value, as a fraction (`3.0734`) |
| E | Energy | can be negative (cost) |
| F | Concerto | can be negative |
| G | Offtune | **stored ×10000** (`2.1*10000*8`); Rotations divides by 10000 |
| H, I | Forte1, Forte2 | two independent forte gauges; negative = spend |
| J | Dots | dot application count |
| K | **Node** | `normal/skill/forte/liberation/intro` — see the §4 warning |
| L, M, N, O, P | Element, Scaling, Type, Special, Buff ID | **the 5 tag slots** |
| Q | temp | scratch, drop |

### `Stats` — buff database (1461 rows, 305 distinct sources)
This is the most important sheet. Each row is one stat modifier.

| Col | Field | Meaning |
| --- | --- | --- |
| A | Notes | free text, e.g. `final stat`, `havoc bane` |
| B | Name | the buff source — a `Gear.Name`, or `global` |
| C | Scope | `Self/Team/Next/Last/Other` — who receives it |
| D | Value | the coefficient |
| E | Type | **tag filter**; blank = applies to every action |
| F | Stat | which stat it modifies |
| G | Burst | if TRUE, only applies while the resonator is on-field (§3) |
| H | Scaler1 | multiply by this stat's current value; blank → ×1 |
| I | Scaler2 | multiply by `clamp(value, Start, End) − Start`; blank → ×1 |
| J, K | Start, End | clamp bounds for Scaler2 |
| L | Lookup | derived: `Name & Scope`. The join key. |
| M, N | ConditionCol, ScalerCol | derived column indices — a spreadsheet implementation detail, drop |

Scope distribution: Self 1252, Team 137, Next 49, Last 13, Other 11.

`Stats` headers disagree with the `Buffs` sheet's headers (`Buffs` labels col H
"Condition" and col I "Scaler"). The formulas are authoritative and agree with
`Stats`' own naming: **H is the plain multiplier, I is the clamped/offset one.**
The `Buffs` labels are stale — don't copy them.

### `Rotations` — 69 named rotations, 866 action rows
`A` = rotation name (repeated on every row of the block), `B` = an `Actions.Lookup`.
`C:Q` are all derived running totals: `offtune`, `forte1/2`, `concerto`, `dots`,
`energy` per action, plus `S`-prefixed cumulative `SCAN` sums, `50buildup`/`0buildup`,
and `K` = the Burst flag (§3). **None of `C:Q` is data** — recompute it in JS.

### `Builds` (208) and `Teams` (234)
- `Builds`: `A` name, `B:J` = the 9 gear slots — `Resonator, Weapon, Mode, Sequence,
  Mainslot, Sonata, 2pc, Mainstats, Substats` — `K` rotation, `L` cost (derived).
- `Teams`: `J` name, `K/L/M` = build name per slot, `A` = a calculate-me checkbox,
  `N/O/P` = derived buff-source lists (§3), `B:H` = derived DPR output.

---

## 3. How a calculation actually works

### Step 1 — expand teams into action rows
`Calculator!A2` walks every `Teams` row with the checkbox ticked, resolves each slot's
build → rotation → action list, and emits one row per (team, slot, action), carrying
`Team`, `Action`, `Burst`, `Slot`. 861 rows is just the current capacity.

### Step 2 — the Burst / Active window
`Rotations!K` computes, per contiguous rotation block: the **last** action whose name
contains `"Intro"`, and the **first** `"Outro"` at or after it. Actions in
`[intro, outro)` get `Burst = TRUE`. This is the on-field window — `Stats` rows with
`Burst = TRUE` only apply inside it.

Note this is driven by **substring matching on the action name**, not by the `Type`
tag, even though `intro`/`outro` exist as tags. Worth fixing in the port.

### Step 3 — resolve the buff-source list per row  (scope resolution)
`Teams!N/O/P` build a comma-joined key list per slot. For slot *s* with builds
`k, l, m` in slots 1, 2, 3:

```
Self  ← s
Next  ← s+1 (mod 3)      cyclic
Last  ← s+2 (mod 3)      cyclic, i.e. the previous slot
Other ← both non-self slots
Team  ← all three slots
plus "globalSelf" always
```

Each of the build's 9 gear names is suffixed with the scope (`"Jingran" + "Self"` →
`JingranSelf`) and kept **only if that exact key exists in `Stats.Lookup`**. So
`Next`/`Last` are the next/previous resonator in the rotation order, and the team is
treated as a **cycle**, not a line.

### Step 4 — accumulate every stat  (the core loop)
Each stat is one `Calculator` column, and the columns are evaluated left to right.
For row *i* and stat *X*:

```
statValue(i, X) = Σ  over Stats rows s where
      s.Stat == X
  AND (s.Type == ""  OR  s.Type ∈ tags(i))
  AND (s.Name & s.Scope) ∈ buffSources(i)
  AND (s.Burst ? active(i) : true)
   of
      s.Value
    × (s.Scaler1 == "" ? 1 : statValue(i, s.Scaler1))
    × (s.Scaler2 == "" ? 1 : clamp(statValue(i, s.Scaler2), s.Start, s.End) − s.Start)

tags(i) = [Element, Scaling, Type, Special, Buff ID]   // Calculator!O, comma-joined
```

Two consequences that matter for the port:

1. **Column order is the topological evaluation order.** Scalers resolve via
   `XLOOKUP(name, $R$1:$BF$1, ...)` — the header row of columns **R…BF only**. So a
   scaler may reference any stat in `R:BF` (the base/bonus/counter block) but *not*
   `BG:BT` (`MV`, `MVbase`, `CR`, `CD`, the shred/amp stats). That boundary is the
   dependency layering, and it is enforced only by column position today. In JS this
   must become an explicit dependency order, or the graph must be sorted.
2. `Start` is an **offset, not just a floor**: `clamp(v, min, max) − min`. So
   `Start = 3, End = 12` on `baneExtraStacks` means "count only stacks above 3, cap at
   12". Easy to get wrong as a plain clamp.

Worked example — `flatAtk` is two `Stats` rows (5 and 6):
`1.0 × baseAtk × clamp(bonusAtk,0,999)` + `1.0 × baseAtk × 1` = `baseAtk × (1 + bonusAtk)`. ✓

### Step 5 — the damage formula
Verbatim from `Calculator` `BY:CI`:

```js
notDot  = scaling !== "dot"   // 1 / 0
notTune = scaling !== "tune"

finalStat = floor( scaling==="atk" ? flatAtk : scaling==="hp"  ? flatHP : scaling==="def" ? flatDef
                 : scaling==="tune"? TUNE_CONST : scaling==="dot" ? DOT_CONST : 0 )

finalRes  = DEFAULT_RES − resIgnore*notDot − resShred
resFactor = finalRes < 0   ? 1 − finalRes/2
          : finalRes < 0.8 ? 1 − finalRes
          :                  1 / (1 + 5*finalRes)

enemyDef  = 792 + enemyLevel*8
finalDef  = (1 − notDot*defIgnore) * floor( enemyDef * (1 − defReduce − notDot*defShred) )
resoDef   = 800 + resonatorLevel*8
defFactor = resoDef / (resoDef + finalDef)

finalMV   = multiplier * (1 + MV) * (1 + MVbase)

noCrit = finalMV * finalStat
       * (1 + amplification*notDot*notTune + specialAmp)
       * (1 + damageBonus  *notDot*notTune)
       * resFactor * defFactor * (1 + damageDealt)

crit   = noCrit * (notDot*notTune ? CD : 1)
avg    = CR >= 1 ? crit : noCrit*(1 − CR) + crit*CR
```

Notes: `CD` is the **total** multiplier (global default `1.5`), not a bonus. Both
`floor()` calls are load-bearing — `TUNETEST` shows in-game values match only with the
rounding in place. Dot and tune damage deliberately bypass `amplification`,
`damageBonus`, and crit entirely. `baseStat` (`BZ`) and `critCompare`/`dmgCompare`/
`statCompare` (`BV:BX`) are display-only diagnostics.

### Step 6 — aggregate
Slot DPR = `SUMIFS(Calculator.AvgDMG, team, slot)`. Team DPR = sum of the 3 slots. If a
slot sums to 0, `Teams!B/D/E` fall back to a hand-typed number in the same cell — so
**some `Teams` DPR values are stale hardcoded numbers, not live results.** Don't treat
them as expected values when validating the port.

---

## 4. Data-quality findings

Referential integrity is good. Everything below is either a real bug or a migration trap.

**① Case collisions — the single biggest migration hazard.**
Google Sheets `MATCH` on text is **case-insensitive**, so the tag matching in step 4
works today despite inconsistent capitalisation. A naive JS port using `===` would
**silently drop buffs** — no error, just wrong numbers.

| Column | Collisions (count each) |
| --- | --- |
| Element | `fusion` 234 / `Fusion` 22 · `aero` 79 / `Aero` 108 · `glacio` 119 / `Glacio` 32 · `spectro` 154 / `Spectro` 58 |
| Scaling | `atk` 711 / `ATK` 171 · `hp` 5 / `HP` 30 |
| Type | `basic` 284 / `Basic` 104 · `heavy` 112 / `Heavy` 34 · `skill` 82 / `Skill` 47 · `intro` 28 / `Intro` 14 · `outro` 18 / `Outro` 6 · `liberation` 85 / `Liberation` 28 |
| Special | `erosion` 18 / `Erosion` 3 · `frazzle` 26 / `Frazzle` 11 |

Also note `Mainstats`/`Substats` gear names are themselves case-significant strings
(`CD ele ATK atk atk` vs `CD ele atk atk atk` are *different* gear rows) — so
lowercase-normalise **tags**, never gear names. Fix: normalise tags at import, then
validate every tag against the enum and fail loudly.

**② `Node` is dead.** The tag string is built from `Actions!L:P` (Element, Scaling,
Type, Special, Buff ID) — column `K` (**Node**) is excluded. So `Stats.Type` can never
match on a node. `normal` and `forte` appear nowhere in `Stats.Type`, confirming it. So
Node is currently metadata only. Decide: promote it to a real tag, or keep as display.

**③ `midair`** is used as a `Special` in `Actions` but is not in `Config`'s Specials
enum. Either add it or fix the typo.

**④ Missing `Gear` registrations** — these silently contribute nothing:
- `Builds` references sequences `Jingran S1`, `Jingran S2` — absent from `Gear`.
- `Stats` has buffs for `JinhsiS1, JinhsiS3, JinhsiS4, JinhsiS5, JinhsiS6` — absent
  from `Gear`, **and** they break the naming convention (`JinhsiS1` vs `Xuanling S1`
  with a space), so they could never join anyway.
- `Builds` references mainstats `CD ele atk hp hp`, `CR ele atk hp hp` — absent from `Gear`.
- 2 builds reference rotation `erover mdps` — absent from `Rotations`.

This is your TODO's *"implement sequences / generate s1-X when selecting sequence"* —
sequences are hand-registered per resonator and the coverage is incomplete. Generating
`<Resonator> S<n>` rows automatically removes the whole failure class.

**⑤ No stat is dead** — all 44 `Stats.Stat` values resolve to a `Calculator` column,
every value produced is read somewhere, and every `Stats.Type` value matches at least
one action tag. The vocabulary is genuinely all in use.

**⑥ 51 action rows never reach the engine — and that was deliberate.**

`Rotations` column A (the rotation name) is only *sparsely* filled — plenty of rows have
an action in column B but a blank A. `Calculator!A2` selects a rotation with

```
FILTER(Rotations!B:B, TRIM(CLEAN(Rotations!A:A))=rotWord, Rotations!B:B<>"")
```

— an **AND over both columns** — so a blank A cell excludes that row. 917 action slots
exist; the sheet evaluates 866, across 41 of 69 rotations.

This looked like a data-entry bug, but it is an optimisation: **all 51 excluded rows have
a 0% multiplier** (verified — mostly `Outro`, plus a few `Lib`/`Liberation` rows that only
exist to carry resource numbers). They contribute no damage, so skipping them cost
nothing and shortened the array formulas. The burst window is computed separately by
`Rotations!K`, which keys on blank **B**, not blank A — so the on-field window stayed
correct regardless.

The extraction adopts all 51 into their rotations. Damage is unchanged by construction;
what improves is that resource totals (energy / concerto / offtune / forte) are no longer
missing their `Outro` contributions. **DPR diffs against the sheet should therefore still
be clean.**

**⑦ Duplicate keys, all first-wins in the sheet.**
- `Gear`: `Void Thunder 2pc` and `Celestial Light 2pc` are each filed **twice**, once as
  `Sonata` (rows 240–241) and once as `2pc` (rows 246, 249). Category only drives the UI
  dropdowns — buff lookup joins on name alone — so this is cosmetic, but it does put two
  bogus entries in the Sonata dropdown.
- `Actions`: `Iuno: MA2` appears at rows 542 and 543 with multipliers `1.6701` and
  `3.3402` — exactly 2×, so row 543 is really "MA2 ×2" mislabelled. `MATCH` takes the
  first, so row 543 is already dead.
- `Teams`: `jingran r1 cd/hp iuno r1 sk r1` and `YYXL r1 2f chisa r1 rejuv suisui r1`
  each appear twice. `Calculator!CL` resolves buffs with `VLOOKUP(team, Teams!J:P)`, so a
  duplicate silently inherits the **first** team's slot buffs. Currently harmless — only
  one team is enabled — but it is a live trap.
- `Teams` also has ~25 whitespace-only rows in column J that look blank but are not.

**⑧ Only 1 of 209 teams is enabled** (`Teams!A`), so the sheet holds exactly one team's
worth of live results. Everything else in the DPR columns is a stale hand-typed number
(§3 step 6). Plan validation around the one live team plus `TUNETEST`.

---

## 5. The 44 stats, by role — the reduction target

PLAN.md calls for "reducing the number of stats by creating a new tag system". The data
says where the fat is: **only 19 of the 44 stats are real stats.** The other 25 exist
solely because a spreadsheet needs a column per intermediate value.

**Damage-formula stats (19)** — read directly by step 5:
`flatAtk, flatHP, flatDef, baseAtk, baseHP, baseDef, MV, MVbase, CR, CD, damageBonus,
amplification, specialAmp, damageDealt, resIgnore, resShred, defIgnore, defShred, defReduce`

**Intermediates (6)** — plumbing between stats: `bonusAtk, bonusHP, bonusDef, ER, TBB,
countChafeBane`

**Counters / state (19)** — never touched by the damage formula, only used as scalers
by other `Stats` rows. These are *resources and gauges*, not stats:
`countEcho, countBurst, countRupture, countFusion, countTuneBreaks, baneBaseStacks,
baneExtraStacks, strainStacks, selfShields, ghostShroud, buildupRate, applyHack,
applyBane, applyNS, applyBurst, applyRupture, applyStrain, consumeNS, dealDontApplyNS`

The `apply*` group is especially telling: `applyHack` is produced by 2 rows and read as
a scaler by 12 — it is a **boolean gate** ("does this team apply hack?"), not a
quantity. Same shape for `applyBane/NS/Burst/Rupture/Strain`, `consumeNS`,
`dealDontApplyNS`. In a spreadsheet a gate has to be a numeric column; in JS it is a
condition. That is the reduction: **~19 stat columns collapse into a tag/condition
mechanism**, leaving roughly 25 true numeric stats.

---

## 6. Open design question

Everything above is verified fact. The one thing that blocks extracting the data into
its new shape is the target schema for tags/conditions, since it changes how all 1461
`Stats` rows get written. See PLAN.md §"open decisions".

---

## 7. Your TODO sheet, triaged against the findings

| TODO item | Status |
| --- | --- |
| rework tag system | The design decision in §6 |
| rename MV and baseMV | `MV`/`MVbase`; suggest `mvBonus`/`mvBase` — current names invert the meaning |
| rename res shred and def shred to reduce | Note `defShred` and `defReduce` are **already different**: `defShred` is gated by `notDot`, `defReduce` is not |
| rename prefix to form / rename to UBA / change frolo to FHA | Action-name conventions; do during extraction |
| rename action buffs to EBA/ELib/EHA, or inherent1/inherent2 | This is the `action0`–`action11` Buff ID scheme (24 IDs). Semantic names remove the per-resonator ordering coupling |
| implement sequences, generate s1-X | Fixes finding ④ |
| bullets sheet | New data sheet, not in the export |
| link mainslot to echo cast | `Mainslot` gear ↔ `Echo:` actions are currently unlinked |
| speed up rotation sheet | Moot — the JS port removes the `SCAN`/`MAP` array formulas entirely |
| adaptive CR/CD/ele/atk, auto choose ele/atk, adaptive ER | New solver feature: pick mainstats to maximise DPR |
| apply to dot tag / add bell / rover sequences / lib buff / augusta specialenergy2 max | Data entry |
| remove both r1 support/sub sigs except for dual dps | Team-validation rule |
