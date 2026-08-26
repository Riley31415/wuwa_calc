# general
- do not read TODO.md
- comments: 1-2 lines max
- read web pages as a human would; never screenshot them

# implementing kits
- nanoka.cc is the source of truth; `migration/` data is only a sanity check (and a source of action MVs)
- NEVER invent missing forte values — ask for them
- forte deltas go on the action (`forte1`..`forte5`), never via manual set calls; they can go negative when spent, so no bounds/maximums
- forte/concerto/energy a kit lists elsewhere for a cast go directly on that action
- an inherent that applies only to specific actions = a buff added and removed on just those actions
- flat, unconditional equipment stats go in `constantStats`; anything conditional stays in `applyStats`
- a loadout's `weapons` list its best signature first and its best standard weapon second — with the weapons box closed the solver runs only that one

# wording of buffs
- "lost on swap / switching out" = lost on inactive action (`lostOnSwap`)
- ≤20s self buff = lost after outro via conversion; ≤20s team buff = lost on the applier's next intro; ≥21s = permanent
- "all active resonators" = no stat on inactive actions; "all nearby resonators" = applies even when inactive
- "all attribute dmg bonus/amp" = plain dmg bonus/amp, no tag
- a team buff scaled by the applier's own stats: assume the maximum threshold is met

# nanoka data
the damage table is client-rendered — read the CDN json, not the html:
`https://static.nanoka.cc/ww/<ver>/en/character/<id>.json`, `<ver>` from any page's `data-url`
(3.6+365 now), `<id>` 1101-1610 (404s on gaps). plain curl works; WebFetch gets 403.

- `skill.damage[*]` = one hit: `rate_lv[9]` = level-10 MV ×100, `energy` ×100, `element_power` = concerto ×100, `weakness_lvl` = off-tune in engine units
- match against `skill.level[*]` rows: `param[0][9]` is the row text ("22.06%*3+33.08%*2") — resolve each term to its damage entry, multiply, sum. an engine action = the 1-4 rows summing to its MV. more than one distinct answer = unmatched, don't guess

# concerto
a kit is done only when all three sources are read:
1. per-hit `element_power`
2. flat "Concerto Regen" rows in `skill.level[*]` — they *add* on top (5 hits ×2 + "Concerto Regen 20" = 30). most skills/liberations/intros get all their concerto here; intros nearly all carry +10, forte circuits too. bare "Concerto Regen" = the skill's main action, prefixed = that sub-action, "Extra …" = match on words. take the damage row from the *same* skill (MVs collide across skills) and require node/cast to match. regen only adds — a proposal that lowers a value is a mis-match
3. skill/inherent *descriptions* (substitute `param` into `{0}` placeholders, grep Concerto) — put these in a buff via `addStat(Stat.AddConcerto, n)`, never the action's `concerto`, so a re-sync can't overwrite them

also: dodge counters carry a hidden +10; never write 0 over an existing value; "Resonance Cost" = liberation energy cost = `maxEnergy`.

the check: every rotation must reach 100 concerto or its outro can't fire.
