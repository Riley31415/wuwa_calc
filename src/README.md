# src/

Stat, buff and gear system. Pure JS, no dependencies, no DOM.

```
node src/run.js                # Jingran's opener, per action
node src/team.js               # the full team, one rotation per slot
node --test src/test.js

python -m http.server 8000     # then http://localhost:8000/ for the same thing in a browser
```

The web view is `index.html` / `index.css` / `index.js` in the project root. It is not
generated: `index.js` imports these modules and runs the team in the page, so a refresh is
enough to see an edit here. It has to be served rather than opened off disk, since browsers
block module imports and `fetch()` on `file://` URLs.

| file | role |
| --- | --- |
| `stats.js` | the stat vocabulary and its units |
| `registry.js` | `defineBuff` / `defineAction`, and `PRIORITY` |
| `state.js` | `State`, `Slot`, the ambient namespace, the per-action pipeline |
| `damage.js` | the damage formula, transcribed from `Calculator!BY:CI` |
| `chain.js` | collapsing chain results for display |
| `display.js` | the action table: stats and resources snapshotted at each step |
| `test.js` | the whole suite |
| `shared.js` | gear and actions not tied to one resonator |
| `resonators/jingran.js` | a DPS: passives, weapon, sonata, echo, states, actions |
| `resonators/shorekeeper.js` | a support: team grants and the realm's blue/purple/gold handoff |
| `resonators/iuno.js` | a support: shielding, and a Heavy Attack amplification handoff |
| `team.js` | the three of them together, one rotation per slot |

There is no global baseline buff. Every resonator declares its own innate line — 100% ER,
5% crit rate, 150% crit damage — in its own file, so one file describes a resonator
completely.

---

## Units

Ratio stats are authored **in percent**: `add(36, CRIT_RATE)` is +36%. Flat stats are flat:
`add(500, BASE_ATK)`. Motion values are percent too, so `mv: 307.34` is a 3.07× multiplier.
The engine divides by 100 only where it uses a value, so authored numbers always read the
way the game presents them.

`CRIT_DMG` is a **total** multiplier, not a bonus — the baseline's 150 means a crit deals
150%, matching the spreadsheet.

## Buffs

A buff is anything named that applies stats: a resonator's passives, a weapon, a sonata
set, an echo, an outro effect. Gear is just a buff that is on a resonator's list from the
start of the fight. That is why all three delivery mechanisms below can talk about "adding a
buff to a resonator's list".

```js
defineBuff("Myriad Snare", {
  apply() {
    add(12, "fusion", DMG_BONUS);
    add(12, "heavy", DMG_BONUS);
  },
});
```

Functions use the **ambient namespace** — `add`, `get`, `hp()`, `counter()` — rather than
threading `state` through every call.

### Conditions are a scope on the stat

`add` has two forms:

```js
add(value, stat)         // applies to everything
add(value, tag, stat)    // applies only when the action matches `tag`
```

**Any** stat can be scoped — there is nothing special about damage bonus. All of these are the
same mechanism, a stat key with a tag glued on:

```js
add(12, "fusion", DMG_BONUS);      // 12% fusion damage
add(50, "heavy", AMP);             // 50% amplification on heavy attacks
add(12, "heavy", CRIT_RATE);       // 12% crit rate on heavy attacks
add(7.2, "liberation", DEF_IGNORE);// pierces defence on liberation damage only
```

A conditional matches the action's **element** or its **damage type**. `node` and `scaling` are
deliberately excluded: Jingran's Lib1 has node `liberation` but type `heavy`, so resolving node
would start paying liberation bonuses on it.

What is left for an `if` is anything that is not a property of the action's element or type —
a gauge threshold, a stack count, whether a gear piece is equipped:

```js
function heavyAttack(mvPer1000) {
  if (counter(MINGFIRE) > 0) add(/* … */, MV);
}
```

### States are buffs

A state — Jingran's Earth Charm, a stance — is just a named buff that an action puts on the
resonator. It applies every action like any other buff, and can revoke itself when it is done.
`grantSelf` puts it at the **front** of the list, so a state that moves a counter applies before
the gear that scales on it and the gear reads the value this action produced. It needs no
special stage.

```js
defineBuff("Jingran: Earth Charm", {
  apply() { if (onField()) gainTeam(SHIELDS, 1); },
});

// an action opens it, via a buff of its own
defineBuff("Jingran: open Earth Charm", { apply() { grantSelf(EARTH_CHARM); } });
```

Prefer deriving a state from a gauge over holding a separate flag — `counter(MINGFIRE) > 0`
is Jingran's whole liberation window.

Shields are **per resonator**, not shared: Jingran's weapon caps at 6 of his own stacks and
Iuno's Crown of Valor caps at 5 of hers, so each is a stacking buff on its own wearer rather
than any shared total. Reading a *teammate's* live stat (rather than calling their exported
hook) was tried and reverted — not worth re-running another resonator's whole buff list on
every action of everyone else's rotation. If a mechanic ever needs it, `grantOthers`/`grantTeam`
plus an exported function is the pattern; keep the buff list itself untouched.

### Reaching another resonator

`slotsWith(buffName)` finds every slot holding a buff, which is how one resonator's code
addresses another's. Export a named function rather than making callers poke at counters —
this is how Iuno's shielding feeds Jingran's Ghost Shroud instead of the sheet's flat guess:

```js
// jingran.js
export function allyGainedShield(stacks = 2) {
  for (const slot of slotsWith(JINGRAN)) { /* feed his Ghost Shroud */ }
}

// any shielder's file
import { allyGainedShield } from "./jingran.js";
apply() { allyGainedShield(); }
```

### The four stages

A buff that only *adds* a stat can stay at `STATS` — sums do not care about order. A buff
that *reads* a summed one has to run after everything that feeds it, and that is what the
conversion stages are for. `registry.js` carries the full list; in short:

| stage | for | example |
| --- | --- | --- |
| `UPDATE_BUFFS` | what the cast itself does, before anything reacts to it | Jingran's intro spending Ghost Shroud |
| `STATS` | stats, states, gauges — nearly everything | gear, passives |
| `EARLY_CONVERSION` | conversions reading a summed total | Jingran HP → ATK; Shorekeeper ER → team crit |
| `LATE_CONVERSION` | conversions reading what an earlier one produced, and aggregations | Tune Break's break boost → special amp |

```js
defineBuff("Jingran: HP conversion", {
  priority: PRIORITY.EARLY_CONVERSION,
  apply() {
    if (!onField()) return;
    add(36 * per1000(hp(), 0, 50000), FLAT_ATK);
  },
});
```

There are no shared clamp/window helpers: a kit does its own arithmetic in its own file, so
`per1000` and the shield caps live in `jingran.js` where they are used.

### Six lists, three of them applying

| list | holds | applies |
| --- | --- | --- |
| `slot.self` ×3 | each resonator's own gear and the states its actions opened | the acting one |
| `state.team` | team-wide auras, stored **once** rather than copied per resonator | always |
| `state.currentOutro` | what the resonator on the field picked up when it introed | until it outros |
| `state.outroQueue` | published, waiting for the next intro | never |

An action resolves `slot.self + currentOutro + team`, plus the buffs the action itself brings.
`state.activeBuffNames()` is that combination.

```js
// own gear — seeded at the start of the fight, onto slot.self
state.startFight({ Jingran: LOADOUT });

// a state the resonator opens for itself, also slot.self (front-inserted)
grantSelf(EARTH_CHARM);

// the outro queue — handed over on the next intro, dropped on that resonator's outro
outro("Shorekeeper: Stellarealm handoff");

// a team-wide aura, held once
grantTeam(BUTTERFLY);
revokeTeam(REALM_PURPLE);

// specific resonators rather than the whole team — a single team list cannot
// express "everyone but me", so this writes to their own self lists
grantOthers("Fallacy: team attack");
```

The outro queue is what the spreadsheet called scope `next`; `grantTeam` covers `team` and
`grantOthers` covers `other`. Both grants are idempotent, so a buff may re-assert one every
action without the list or the log growing.

`equipped(name)` asks all three live lists. `statOf(resonatorBuff, stat)` reads a **teammate's**
stat by re-running their `self + team` buffs in a read-only context, so nothing they do can
take effect twice.

## Rules every resonator shares

The engine applies these itself, so no kit has to remember them and no kit can disagree:

- an **intro** opens the on-field window and takes over the outro queue. An intro is
  recognised by its **node**, not its damage type — Shorekeeper's deals skill damage and her
  Discernment deals liberation damage, and both are intros. `outro` and `echo` are nodes too,
  for actions that deal no outro or echo damage at all
- an **outro** closes the window and drops everything it adopted; it contributes **nothing**
  to the concerto total
- a **liberation** (`node: "liberation"`) contributes **nothing** to the energy total

Both of those consume whatever is banked, which a running total cannot express, so they
simply do not move it. The costs they declare (`-125` energy, `-100` concerto) stay on the
action and are still shown — they just do not feed the counter.

A follow-up summoned by a liberation should therefore *not* carry `node: "liberation"` — it
is a summon, not the cast, and would otherwise re-empty the bar.

## Chains

One rotation entry can stand for several actions. `BA1234` expands to the four basic stages,
each still evaluated on its own with its own snapshot and its own damage — the chain only
changes how the result reads.

```js
defineChain("Jingran: BA1234",
  ["Jingran: BA1", "Jingran: BA2", "Jingran: BA3", "Jingran: BA4"]);

const lines = collapseChains(rows);   // rows are [{ snap, dmg }]
```

A collapsed line carries the **total motion value** of every part, the **summed damage**, and
the stats of **whichever part hit hardest**. Members may be of different types — stages 1-2
are basic and 3-4 are heavy — which is exactly why no single set of stats describes the chain
and the hardest part is used. Follow-ups queued mid-chain stay out of the group.

## Actions

```js
defineAction("Jingran: FHA", {
  node: "forte", element: "fusion", type: "heavy", scaling: "atk",
  mv: 307.34,
  energy: 10.53, concerto: 13, offtune: 1.014,
  shields: 1,
  apply() { /* spend the gauge, queue the follow-up, add its own stats */ },
});
```

Whatever a cast does beyond its numbers — spend a gauge, open a state, queue a follow-up, add
its own stats — is written as the action's own `apply()`. It runs for that action only and
never joins the resonator's buff list. Two actions that do the same thing point at the same
plain function (`apply: heavyAttack`); there is nothing to register or name.

It runs **after** the resonator's gear in the same priority band (the sort is stable), so it can
read summed totals like `hp()`. An action may also declare a `priority` — which is how the tune
break converts the whole team's break boost into special amplification at `LATEST`, once every
other buff has contributed it.

`shields` says how many shields the cast grants. Everything shield-driven in the game is phrased
as an event — "upon gaining a Shield, gain 1 stack, up to N" — so that is what this is, and the
buffs that care read it back off the action:

```js
defineGear(LAMP_5PC, {
  apply() { if (action().shields) addStack(LAMP_STACKS, 1, LAMP_MAX); },
});
```

A watcher that has to tell a teammate's shielding from the acting resonator's own asks
`equipped()` which resonator is acting — that is how Jingran's Trace the Vestige pays 2 Ghost
Shroud for an ally's shield and 1 for his own.

Queue a follow-up with `queue(CHIMEI)`. Follow-ups are spliced in **directly
after** the current action in the order they were queued, and a follow-up may queue more of
its own. A cyclic queue throws rather than hanging.

## Per-action pipeline

1. intro opens the on-field window and adopts queued outro buffs; outro closes it
2. the action's declared resource deltas
3. every buff's `apply()`, in priority order — `EARLY` states that move a counter, then the
   gear that reads it, then the buffs the action brought
4. buffs at `LATE` priority — the conversions, and any `LATE` buff the action brought
5. `resolve()` snapshots the totals; `damage(snapshot, config, levels)` returns
   `{ noCrit, crit, avg }` — nothing else

`resolve()` captures everything **eagerly** — a snapshot never reads back through to the live
slot, and it carries the full entry list, so "which buffs hit this stat, and why" is already
answerable per action (`run.js --entries` prints exactly that).

`ATK`/`HP`/`DEF` are folds computed on demand: `base × (1 + bonus%) + flat`, floored. So a
LATE conversion adding `FLAT_ATK` is picked up by any later read without re-deriving.

## Display

`buildReport(lines, { gauges, strip })` turns collapsed rows into columns and rows of
formatted values — one line per step, carrying the stats and resources snapshotted at it:
attack, HP, motion value, damage bonus, crit, then energy, concerto, off-tune and the forte
gauges under the names the resonator gives them.

```js
export const GAUGES = [
  { key: QI, label: "qi" },
  { key: MINGFIRE, label: "mingfire" },
];
```

A resource nothing ever moves gets no column. `renderReport` is the terminal spelling of the
same data, and `explain(snapshot)` lists every contribution behind one row, attributed by
source — the old spreadsheet's `Buffs` inspector.

## Counters vs stats

Stats are rebuilt from the buff list on every action, so a buff contributing every action is
naturally idempotent. Counters persist instead — that is the whole difference.

- **team-wide counters** on `State`, read with `teamCounter()`, moved with `gainTeam()` /
  `spendTeam()`: `COUNT_FUSION`. Anything on the team can read or spend them.
- **per-resonator counters** on `Slot`, read with `counter()`: `ENERGY`, `CONCERTO` and the
  four generic gauges `FORTE1`–`FORTE4`. All are running totals across the rotation and none
  is shared between resonators. `OFFTUNE` is the exception: it is **team-wide**, because the
  whole team fills one off-tune bar. **Use the forte gauges in order for whatever a kit has, and only invent
  a name of your own once all four are taken** — Jingran's four are Qi, Mingfire, Fortune in
  Disguise and Ghost Shroud.

Prefer deriving a state from a gauge over adding another gauge. Jingran's Yinghuo window and
his Wayfarer's Marks are both just thresholds on Mingfire — `> 0` and `> 25` — so 100 Mingfire
spent 25 at a time gives four follow-ups and three refunds without either being tracked.
- **gauges contributed by buffs** — `GHOST_SHROUD` and friends: rebuilt each action, so they
  behave like any other stat.

`TBB` (tune break boost) is **not** a counter — it is an ordinary ratio stat alongside `ER`
and `CRIT_RATE`, in percent units and rebuilt from the buff list every action.

A **static team property** belongs in `onFightStart()`, not `apply()`:

```js
defineBuff("Jingran", {
  onFightStart() { gainTeam(COUNT_FUSION, 1); },   // once
  apply() { /* … */ },                             // every action
});
```

Setting a counter from `apply()` would climb by one on every action. `onFightStart()` runs
for every buff on every list right after `startFight()` seeds them, before any action.

Havoc bane is exported the same way: a resonator that can inflict it contributes the
`defReduce` from its own file, rather than a global rule guessing at stacks.

## Handing a buff to the next resonator

Shorekeeper is the worked example of a support. Her Stellarealm gives the team crit rate and
crit damage scaled off **her** energy regen, so the conversion cannot run on the recipient —
by then `get(ER)` would read theirs. It runs `LATE` on her, banks the result in a team
counter, and her outro publishes a buff that simply reads it back:

```js
defineBuff(STELLAREALM, {                 // on her, LATE: reads her summed ER
  priority: PRIORITY.EARLY_CONVERSION,
  apply() { setTeamCounter(REALM_CR, Math.min(12.5, get(ER) * 0.05)); },
});

defineBuff(REALM_HANDOFF, {               // what the next resonator holds
  apply() { add(teamCounter(REALM_CR), CRIT_RATE); },
});

// her outro publishes it; the engine delivers on the next intro and revokes on that outro
apply() { outro(REALM_HANDOFF); }
```

An **intro is recognised by its node**, not its damage type — hers deals skill damage and her
Discernment deals liberation damage, and both are still intros.

## Adding a resonator

One file per resonator in `resonators/`, holding their innate line, passives, signature
weapon, sonata, echo (buff **and** cast) and actions — `jingran.js` is the worked example.
Export a `LOADOUT` (what the build starts holding) and a `ROTATION`. Put anything usable by
others in `shared.js`.

Start from the innate line every resonator has, then their own stats:

```js
defineBuff("Name", {
  category: "Resonator",
  onFightStart() { gainTeam(COUNT_FUSION, 1); },
  apply() {
    add(100, ER); add(5, CRIT_RATE); add(150, CRIT_DMG);   // innate
    add(13713, BASE_HP); add(350, BASE_ATK);               // their own
  },
});
```

`data/stats.json` is the source material: the rows for a gear name are the buff you are
writing. Cross-check the mechanics against the kit on nanoka.cc, whose static JSON is at
`static.nanoka.cc/ww/<version>/en/character/<id>.json` — the sheet often carries a capped or
averaged number where the kit gives the real formula. Scope `self` → mechanism 1, `next` → mechanism 2, `team`/`other` → mechanism 3, a
`type` tag → either a scoped stat or a condition in the action, and `scaler2` with
`start`/`end` → arithmetic in the resonator's own file (the lower bound is an offset, not
just a floor).
