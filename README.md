# wuwa_calc

A Wuthering Waves damage calculator. Pure TypeScript, no framework, no bundler — `tsc` compiles
`index.ts` and everything under `src/` into `dist/`, mirrored one level deeper.

```
python serve.py                # then http://localhost:8731/
npx tsc                        # build; npx tsc --noEmit to just typecheck
```

Has to be served, not opened off disk — browsers block module imports on `file://` URLs.

| path | role |
| --- | --- |
| `src/kit.ts` | the engine: `Gear`/`Buff`/`Action`/`Loadout`/`State`, `equip()`/`run()`/`evaluate()` |
| `src/stats.ts` | the stat vocabulary (`Stat`, `Element`, `Type1`/`Type2`, `Cast`, `Node`, `Scaling`) |
| `src/damage.ts` | the damage formula |
| `src/display.ts` | turns a run into the report/hover-trace data the page renders |
| `src/resonators/<region>/*.ts` | one folder per region (jinzhou, blackshores, rinascita, septimont, lahairoi, mengzhou), plus `standard/` for the launch-roster standard characters: one file per resonator — actions, buffs, the Resonator itself, talents, inherent skills, sequences, a sample rotation, a loadout |
| `src/echoes/<region>.ts` | mainslot echoes and sonata sets, one file per region that introduced them (Black Shores' Fallacy lives in jinzhou.ts) |
| `src/weapons/*.ts` | signature and standard weapons, grouped by weapon type |
| `src/mainstats.ts` / `substats.ts` | echo main-stat builds (`mainstats()`) and substat spreads (`substats()`/`chem()`) |
| `index.ts` | the whole site — team definitions, the comparison table, the detail page |

## The engine

A `Gear` is anything equippable that can react to actions: `Buff`, `Debuff`, `Talent`,
`Inherent`, `Sequence`, `Weapon`, `Mainslot`, `Sonata`/`Sonata2pc`, `Resonator` itself — all
plain subclasses, nothing added. A `Resonator` is just a `Gear` that also carries element/
weapon type/base stats/`maxEnergy`/color.

```ts
export const MYRIAD_SNARE = new Mainslot({
  name: "Myriad Snare",
  action: ACTION_MYRIAD_SNARE,
  apply: () => { addStat(Stat.DmgBonus, 12, Element.Fusion); addStat(Stat.DmgBonus, 12, Type1.Heavy); },
});
```

Each piece of `GearDef` runs at a different point in `evaluate()`, for whichever Gear is
actually held (locally, globally, or on the enemy) when an action resolves:

- `combatStart` — once, at `equip()` time, never mid-fight (a resonator's own base stats).
- `update`/`updateGlobal` — grant/revoke/queue/spend, never a stat contribution. `update` only
  runs for gear held by the acting slot; `updateGlobal` runs for every slot's own held gear
  every action, `currentSlot` switched to that gear's own holder — how a self-held buff reacts
  to a *teammate's* action without being promoted to a real team-wide buff.
- `apply` — stat contributions, `addStat(stat, value, tag?)`. Runs after every `update()`.
- `convert` — for a buff that reads a value some other buff's own `apply()` just produced
  (an HP fold into a stat conversion, a threshold check against a running total).

`addStat`'s optional third argument scopes it to an element or damage type (`Type1`/`Type2`) —
`get(stat)`/`pct(stat)` sum both the bare and the matching scoped entries for whatever action is
resolving. `node`/`cast`/`scaling` never participate in scoping.

## Actions

```ts
export const FHA = jingranAction("Forte - Stardome Meander", {
  node: Node.Forte, cast: Cast.Heavy, shields: 2, type: Type1.Heavy, mv: 240.38,
  energy: 8.5, concerto: 13, offtune: 10400, forte1: -300,
});
```

`mv`/`energy`/`concerto`/`offtune`/`forte1`-`forte5` are the action's own declared baseline,
banked automatically every time it resolves — a kit never mutates its own running total or
gauge directly from an action. A buff that needs to contribute *on top* of the declared amount
(a proc, a conditional refund) does it through `Stat.AddEnergy`/`AddConcerto`/`AddOfftune`/
`AddForte1`-`5`, so the contribution still traces back to whichever buff granted it.

`shields` says how many shields a cast grants — read back off `currentAction().shields` by
whichever kit reacts to it (its own, or, via `updateGlobal()`, a teammate's).

`queue(action)`/`queueOn(resonator, action)` splice a follow-up in directly after the current
one; `queueOutro(buff)` hands a buff to whoever the outro queue delivers it to next.

## Conventions

- Forte gauges (`forte1()`-`forte5()`) have no floor or ceiling of their own — a kit clamps its
  own real bounds itself (`setForteN`) only where the mechanic actually needs one.
- A short window (≤20s): a self buff is lost after the outro action gains stats (`convert()`,
  checked after `apply()` already paid out); a team buff is lost on the applier's own next
  intro. A window ≥21s is permanent uptime once granted, never revoked. An outro-lost buff is
  checked in `update()` instead, matching the standing "lost on inactive action" rule.
- ICD-gated passives ("triggers once every 0.5s") fire on every qualifying action instead —
  there's no real-time clock here.
- A live per-hit ramp that only makes sense against real-time state this engine doesn't track
  (a resonance-chain trigger tied to a teammate's own unspecified cast rate, a per-hit stacking
  buff inside an already-lumped multi-hit window) is left undocumented as a no-op rather than
  approximated — flagged in the file, not guessed at.
- A resonator's own file is ordered actions, then buffs/talent/inherents/sequences, then the
  `Resonator` itself, then its talent-tree bonus, then a sample rotation, then its loadout(s).
- Sequence nodes (S1-S6) are out of scope by default — every build is sequence 0 — except a
  resonator explicitly marked `standardCharacter: true` (a standard-banner pull, trivially
  farmable to full sequence), which folds all six in as always-equipped `Sequence` pieces.

## Adding a resonator

One file in the resonator's own region folder (`src/resonators/<region>/`). Cite the nanoka.cc character page and, where used, the migrated
sheet in the file header. Export a `_LOADOUT` (a `Loadout`, built from the resonator + talent +
both inherents + weapon + mainslot + sonata + mainstat + substat, plus up to six sequence nodes)
and a rotation array. Wire it into `index.ts`'s own `TEAMS` once it has a team to run in — a
fully-ported resonator with no team yet (see `buling.ts`/`lucilla.ts`) is normal, not a stub.
