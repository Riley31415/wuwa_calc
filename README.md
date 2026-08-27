# wuwa_calc

A Wuthering Waves damage calculator. Pure TypeScript, no framework, no bundler — `tsc` compiles
everything under `src/` into `dist/`, mirrored one level deeper (`src/index.ts` → `dist/src/index.js`).

```
python serve.py                # then http://127.0.0.1:8731/src/index.html
npx tsc                        # build; npx tsc --noEmit to just typecheck
```

Has to be served, not opened off disk — browsers block module imports on `file://` URLs. Use
`127.0.0.1`, not `localhost`: the server binds IPv4 only, and on Windows `localhost` tries IPv6
first and stalls ~200ms on *every* connection, which adds up across the dozens of unbundled
module files `dist/` ships as.

| path | role |
| --- | --- |
| `src/engine/kit.ts` | the engine: `Gear`/`Buff`/`Action`/`Loadout`/`State`, `equip()`/`run()`/`evaluate()` |
| `src/engine/stats.ts` | the stat vocabulary (`Stat`, `Attribute`, `Type1`/`Type2`, `Cast`, `Node`, `Scaling`) |
| `src/engine/damage.ts` | the damage formula |
| `src/engine/rotation.ts` | `Rotation` and the scheduler that decides whose turn it is |
| `src/engine/solver.ts` | the build search and the DOM-free engine run that scores it; also the Worker entry point |
| `src/engine/teams.ts` | the `LOADOUTS` registry and every team the comparison table runs (`ALL_TEAMS`) |
| `src/engine/display.ts` | turns a run into the report/hover-trace data the page renders |
| `src/engine/mainstats.ts` / `substats.ts` | echo main-stat builds (`mainstats()`/`mainstatOptions()`) and substat spreads (`substats()`/`chem()`) |
| `src/resonators/<attribute>/*.ts` | one folder per attribute (`aero`, `electro`, `fusion`, `glacio`, `havoc`, `spectro`): one file per resonator — actions, buffs, the Resonator itself, talents, inherent skills, sequences, a sample rotation, a loadout |
| `src/echoes/<region>.ts` | mainslot echoes and sonata sets, one file per region that introduced them (grouped by region, unlike the resonator folders; Black Shores' Fallacy lives in `jinzhou.ts`) |
| `src/weapons/*.ts` | signature and standard weapons, grouped by weapon type |
| `src/index.ts` | the whole site — the comparison table, the filters, the detail page |

`src/index.html` is the page itself and loads `../dist/src/index.js`; `serve.py` serves the repo
root, so both the source tree and `dist/` are reachable from it.

## The engine

A `Gear` is anything equippable that can react to actions: `Buff`, `Debuff`, `Talent`,
`Inherent`, `Sequence`, `ResonanceMode`, `Weapon`, `Mainslot`, `Sonata`/`Sonata2pc`, `Action`,
and `Resonator` itself — all plain subclasses, nothing added. A `Resonator` is just a `Gear`
that also carries element/weapon type/base stats/`maxEnergy`/color.

```ts
export const THRENODIAN_LEVIATHAN = new Mainslot({
  name: "Reminiscence: Threnodian - Leviathan",
  action: ACTION_THRENODIAN_LEVIATHAN,
  constantStats: () => { addStat(Stat.DmgBonus, 12, Attribute.Havoc); addStat(Stat.DmgBonus, 12, Type1.Liberation); },
});
```

Each piece of `GearDef` runs at a different point in `evaluate()`, for whichever Gear is
actually held (locally, globally, or on the enemy) when an action resolves. In order:

- `combatStart` — once, at `equip()` time, never mid-fight (a resonator's own base stats).
- `updateDebuffs` — what this cast *inflicts* (a Negative Status, a Shifting, the shield/heal
  markers), first of all so everything downstream can see it.
- `updateGlobal` — runs for every slot's own held gear on every action, `currentSlot` switched to
  that gear's own holder — how a self-held buff reacts to a *teammate's* action without being
  promoted to a real team-wide buff.
- `updateBuffs` — grant/revoke/queue/spend for the acting slot's own gear. Never a stat.
- `constantStats` — flat, unconditional contributions (cached per action tag word).
- `applyStats` — conditional stat contributions, `addStat(stat, value, tag?)`.
- `convertStats` / `lateConvertStats` — for a buff that reads a value some other gear's own
  `applyStats()` just produced (an HP fold, a threshold check against a running total).
  `lateConvertStats` runs a phase later again, for a conversion that would otherwise race another
  gear's `convertStats()`.
- `afterAction` — cleanup once the row is resolved.

`addStat`'s optional third argument scopes it to an attribute or damage type (`Type1`/`Type2`) —
the running totals sum both the bare and the matching scoped entries for whatever action is
resolving. `node`/`cast`/`scaling` never participate in scoping. A debuff that changes the
*enemy's* own stat (Res Reduce, Def Reduce) uses `addEnemyStat()` instead.

Grants come in one flavour per pool: `applyCurrent`/`revokeSelf` (this slot),
`applyTeam`/`revokeTeam` (team-wide), `applyEnemy`/`revokeEnemy` (on the target),
plus `addBuff(resonator, …)` to pay out onto one specific member regardless of whose turn it is.

## Actions

```ts
const Intro = chisaAction("Intro - Reverberance - Return", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro,
  mv: 95.43, energy: 10, concerto: 10, offtune: 6400, forte1: 20,
});
```

`mv`/`energy`/`concerto`/`offtune`/`forte1`-`forte5` are the action's own declared baseline,
banked automatically every time it resolves — a kit never mutates its own running total or
gauge directly from an action, and a forte delta goes on the action rather than through a manual
set call. A buff that needs to contribute *on top* of the declared amount (a proc, a conditional
refund) does it through `Stat.AddEnergy`/`AddConcerto`/`AddOfftune`/`AddForte1`-`5`, so the
contribution still traces back to whichever buff granted it.

`active: false` marks a cast that doesn't hold the field (an outro, an off-field follow-up), which
is what every "lost on switching out" buff keys off via `lostOnSwap()`. `resetEnergy` marks the
real button-press Liberation that spends the bar.

`queue(action)`/`queueOn(resonator, action)` splice a follow-up in directly after the current
one; `queueEvent(action)` puts an engine-level event (a Tune Break) ahead of them, unpinned;
`queueOutro(buff)` hands a buff to whoever the outro queue delivers it to next.

## Rotations

A rotation is up to three *action chains* — one per way of arriving on field — written as a
single flat array that `Rotation`'s constructor splits apart on its markers:

```ts
new Rotation([
  START_COMBAT_NON_OPENER, Skill, START_COMBAT_NON_OPENER,  // the fight's own first seconds
  OPENER, BA1, BA2,                                         // leading the team, no Intro to cast
  INTRO, Liberation, ECHO_CAST, OUTRO_NEXT,                 // every visit after
]);
```

The `OPENER` chain runs *through* the `INTRO` marker without casting it and carries on into the
same tail, so the body a resonator repeats is written once. `INTRO`/`ECHO_CAST` resolve at run
time against whatever the acting slot actually has equipped; `OUTRO_NEXT`/`OUTRO_LAST` choose
which way the field is handed on. Only slot 1 can use an `OPENER`.

Every rotation must reach 100 concerto, or its outro can't fire.

## Conventions

- Forte gauges (`forte1()`-`forte5()`) have no floor or ceiling of their own — a kit clamps its
  own real bounds itself (`setForte1`…) only where the mechanic actually needs one.
- A short window (≤20s): a self buff is lost after the outro action gains stats (checked in
  `convertStats()`, after `applyStats()` has already paid out); a team buff is lost on the
  applier's own next intro. A window ≥21s is permanent uptime once granted, never revoked. A
  buff whose text says "lost on swap" is checked with `lostOnSwap()` in `updateBuffs()` instead.
- Flat, unconditional equipment stats go in `constantStats`; anything conditional stays in
  `applyStats`.
- ICD-gated passives ("triggers once every 0.5s") fire on every qualifying action instead —
  there's no real-time clock here.
- A live per-hit ramp that only makes sense against real-time state this engine doesn't track
  (a trigger tied to a teammate's own unspecified cast rate, a per-hit stacking buff inside an
  already-lumped multi-hit window) is left undocumented as a no-op rather than approximated —
  flagged in the file, not guessed at.
- A resonator's own file is ordered actions, then buffs/talent/inherents/sequences, then the
  `Resonator` itself, then its talent-tree bonus, then a sample rotation, then its loadout(s).
- Sequence nodes (S1-S6) are out of scope by default — every build is sequence 0 — except a
  resonator explicitly marked `standardCharacter: true` (a standard-banner pull, trivially
  farmable to full sequence), which folds all six in as always-equipped `Sequence` pieces.

## Adding a resonator

One file in the resonator's own region folder (`src/resonators/v<patch><region>/`). nanoka.cc is
the source of truth; cite the character page in the file header, and where a gauge isn't exposed
there, note the fallback used. Never invent a missing forte value.

Export a `_LOADOUT` — a `Loadout` naming the resonator, its talent, both inherents, every viable
weapon (best signature first, best standard second), the `EchoLoadout` options, the main-stat
builds, a substat spread, and the `Rotation`. Then register it in `src/engine/teams.ts`: add it
to `LOADOUTS` (which is also how a Worker resolves a team it was handed by name) and, once it has
a team to run in, to `TEAMS`. A fully-ported resonator with no team yet is normal, not a stub.

`RESONATORS.md` tracks who is still unimplemented.
