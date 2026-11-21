# resonators
Implementing a kit: reading its text, the gauges and conditions, wording, naming and units, and where its
numbers come from and how to import them — read before adding, changing or re-syncing a kit or an echo.

# implementing kits
- nanoka.cc is the source of truth. the old `migration/` sheet data is gone from the tree — cross-check a
  number that looks wrong against wuwalab or encore.moe, and ask rather than pick
- NEVER invent missing forte values — read them off wuwalab, and ask only if it has none:
  `https://api.wuwalab.com/api/app/characters/<slug>`, `abilities[*].on_cast_forte_N` and per-hit
  `hits[*].forte_N`. **forte there is raw points**, while `motion_value`/`energy`/`concerto` are ×100 and
  `off_tune` is already engine units — check one field against a number the kit text states before
  trusting the rest. it also resolves rows nanoka's own damage entries don't sum to
- forte deltas go on the bullet that banks them (`forte1`..`forte5`) or on the cast (`castForte1`..`castForte5`),
  never via manual set calls; they can go negative when spent, so there is no floor. the *ceiling* is
  `maxForte1`..`maxForte5` on the Resonator (48 of 50 kits declare theirs) and only bites when a cast spends — the spend starts from the cap, not from the overrun
- a gauge whose real ceiling moves with state (Zani's Blaze: 100, 150 in Inferno Mode) declares the higher
  one as `maxForteN` and clamps the lower itself
- a cast that drains a gauge whole ("depletes all", "consumes the whole bar") sets `resetForteN: true` on
  the action: the gauge zeroes *ahead of* that same cast's own `castForteN`, so `resetForte1: true, castForte1: 200`
  lands on 200. a drain that is **conditional** (only while some buff is held) can't use it — declare the cap
  as a negative delta (`castForte1: -200`) and clamp to that cap in the cast's own `updateBuffs`
  (`if (forte1() > 200) setForte1(200)`) so the delta lands exactly at 0. never a bare `setForteN(0)`
- forte/concerto/energy a kit lists elsewhere for a cast go directly on that action
- a cast's *condition* is its own field, never read off what it spends: `minEnergy`/`maxEnergy`,
  `minConcerto`/`maxConcerto`, `minForte1`..`minForte5`/`maxForte1`..`maxForte5` on the action, from
  text that gates the cast ("when X is full, Heavy Attack is replaced with...", "requires full Concerto",
  "with 4 Meta Vectors") — "consumes all X" alone is a spend, no condition. Iuno's Absolute Fullness is
  `minConcerto: 100` and spends none; Hsin's Stilling All Horizons is `maxForte2: 0, resetForte2: true`;
  every non-Unison Outro is `minConcerto: 100`. a state the cast needs (a stance, a summon, a "replaces
  the next Heavy Attack" window) is a Buff named in `requireBuff` — held by her, the team or the target as
  the cast finds it. one buff per cast: a state that only stands inside another declares `lostWith` (it
  ends with it) and the cast requires the inner one; where a form picks which press comes out, a resolver.
  a state the cast can't be under (a base form a stance replaces) is `forbidBuff`, read the same way. a row cast outside its condition reads red and warns once per team, and a hold or
  mash cancel holds until the next press's condition is met
- an inherent that applies only to specific actions = a buff added and removed on just those actions
- flat, unconditional equipment stats go in `stats: [[Stat.X, n, tag?], ...]` (a Buff's `stats` pay while held; `perStack`, `when`, `duration`, `lostOnSwap: true`); a trigger that grants a buff is `grants: [{ on: onCast(...) | onType(...) | onInflict(...) | onApplied(...), buff, stacks?, to?: BuffTarget.Team | BuffTarget.Enemy | BuffTarget.Next }]`; anything the form doesn't fit stays a closure (`applyStats`, `updateBuffs`, ...)
- a loadout's `weapons` list its best signature first and its best standard weapon second — with the weapons box closed the solver runs only that one

# wording of buffs
- "lost on swap / switching out" = `lostOnSwap: true` (or `lostOnSwap()` in a hook): lost on the swap-out action — the Outro's cast, or the `SWAP` after a swap form (the swap form itself pays in full); "while on field" = `isActive()`
- a buff lasts its stated `duration`; with none stated it is permanent
- "all active resonators" = no stat on inactive actions; "all nearby resonators" = applies even when inactive
- "all attribute dmg bonus/amp" = plain dmg bonus/amp, no tag
- a team buff scaled by the applier's own stats: assume the maximum threshold is met
- "when X enters combat, ... (cooldowns reset / gauge restored). This effect can be triggered once every Ns" = a start-of-combat effect (`combatStart`), fired once — never again on a loop or an intro; ignore the cooldown

# naming actions
- an action with a cast is `<Cast> - <name>`: Basic, Mid-air, Heavy, Skill, Liberation, Intro, Outro, Echo, Dodge Counter, Tune Break, Dodge, Jump
  (a kit's own `dodge:`/`jump:` press is `cast: Cast.Dodge`/`Cast.Jump`, whatever damage type it deals); the prefix follows `cast`, not `type` (`Dodge Counter - Moonbow` even though it deals Liberation DMG) — except a mid-air press, which reads `Mid-air` though its cast is Basic
- `Forte <Cast> - <name>` only when the action sits in `Node.Forte` AND spends something (a negative `castForteN` or bullet `forteN`, or a revoke/removeStack/setForte in its def); a stance's plain presses stay `Basic - Umbra 1`, `Heavy - Incarnation`
- mid-air presses are Basic Attacks: `cast: Cast.Basic` and `Mid-air - <name>` (no "(Mid-Air)" suffix), so `casting(Cast.Basic)` already covers them; there is no mid-air cast type, so a "mid-air attack" clause names its presses with `runningAction(X)`; mid-air heavies/dodge counters keep their own cast and carry "(Mid-Air)" in the name
- a plunging attack is a mid-air press too: `Mid-air - <name>` (`Mid-air - Plunging Attack` for a bare one), and a "mid-air attack" clause lists it alongside the aerial chain — unless its cast is not Basic (`Forte Skill - Undying Sunlight: Plunge`), which keeps its own prefix like any other mid-air non-Basic
- every dodge counter is `cast: Cast.DodgeCounter`, named `Dodge Counter - <chain name>` (a bare one takes the basic chain's name: `Dodge Counter - Captain's Rhapsody`)
- extras after the name go in parentheses: `(Charged)`, `(Hold)`, `(Follow-Up)`, `(S6 Blast)`; sub-moves after a colon: `Thrum: Aero Plunge`. A swap form (`.swapCancel()`, `.instaSwap()`, `.mashSwap()`) keeps its cast's name: its tag marks it
- actions with no cast (coordinated hits, ticks, fields, responses) carry the source they belong to instead: `Liberation - Marcato`, `Tune Rupture Response - Starburst`

# units
every gauge value is a whole number: energy and concerto ×100 (`ENERGY_UNIT`, `CONCERTO_UNIT`, a full
bar 10000), MV ×100 of its percent (`MV_UNIT`, 22.06% = 2206), off-tune ×10000, and forte in its
Resonator's `forteScale` units (1 by default, 0.01 for a gauge held in hundredths, 0.0001 for Lupa's
Wolflame). a value that needs decimals means the gauge needs a finer scale, never a fraction
- a bullet carries only its own hit's gains. a dodge counter's hidden +10 goes on `castConcerto`
- a cast hook reading what the press banks reads `currentCast()`: its `castForte`, and its bullets'
  own where it counts the whole press as it is cast (`RING_CONSUMED`'s spend)

# wuwalab
- wuwalab's per-hit energy/concerto/off-tune/forte win over the kit's, but only where its hits' MV
  totals the kit's: it lists a repeated hit once (Lucy's Stage 1 is `12.15%*6+48.59%`, wuwalab shows
  two hits) and leaves out folded-in hits (Shorekeeper's Illation butterflies). a mismatch keeps the
  kit's values. an all-zero resource there is missing, not zero; a Liberation's negative cast energy
  and an Outro's -100 concerto are the engine's own spends

# nanoka data
the CDN json below 404s now (ww.nanoka.cc is a client app). encore.moe carries the same game data:
`https://api-v2.encore.moe/api/en/character/<id>`, `Skills[*].DamageList[*]` = one hit (`RateLv[9]`
level-10 MV, `Energy` ×100, `ElementPower` = concerto ×100, `WeaknessLvl` ×10000 = off-tune) and
`Skills[*].SkillAttributes` = the rows ("Stage 1 DMG: 12.15%*6+48.59%", "Concerto Regen: 7").
the old CDN notes, for when it returns — the damage table is client-rendered, read the json, not the html:
`https://static.nanoka.cc/ww/<ver>/en/character/<id>.json`, `<ver>` from a page's `data-url` —
**a page carries more than one, so take the highest** (3.7.3 on the page now, beside a stale 3.6 — though the CDN already serves 3.7.4, so probe one version up), and the CDN
keeps old directories that are earlier betas rather than earlier patches. `<id>` 1101-1610 (404s on
gaps). plain curl works for the json; WebFetch gets 403, and the html needs a browser UA or it comes
back empty.

- `skill.damage[*]` = one hit: `rate_lv[9]` = level-10 MV ×100, `energy` ×100, `element_power` = concerto ×100, `weakness_lvl` = off-tune in engine units
- match against `skill.level[*]` rows: `param[0][9]` is the row text ("22.06%*3+33.08%*2") — resolve each term to its damage entry, multiply, sum. an engine action = the 1-4 rows summing to its MV. more than one distinct answer = unmatched, don't guess
- lv90 Base HP/ATK/DEF are `stats["6"]["90"]`'s `life`/`atk`/`def`, unrounded; the flat Tune Break Boost is `stats_weakness.weakness_mastery`
- a buff's duration is never in `skill.desc` — it is a `skill.level[*]` row named "<Thing> Duration", and a `{n}` the text never substitutes is usually it

echoes are the same shape at `.../en/echo/<id>.json`, and every id resolves — 6000042-60002xx (the
unreleased ones included, still named "Stay tuned") beside the old 3900700xx/3900770xx. `rate_lv[4]`
is the level-5 MV there, and `skill.damage` carries no hit counts: substitute `skill.param[4]` into
`skill.desc`'s `{n}` and read them off the text, then the action is per-hit × that count. encore's
`/api/en/echo` list is the only name→id index, and it omits the unreleased ones — probe ids instead.

sonata sets are on no CDN endpoint at all (`/sonata/`, `/suit/`, `/set/`, `/echoset/` all 404). read a
set's 2pc/5pc text off the fandom wiki, which needs a browser UA:
`https://wutheringwaves.fandom.com/api.php?action=parse&page=<Set%20Name>&prop=wikitext&format=json`.
which echoes carry a set is `FetterGroups` on each entry of encore's `/api/en/echo` list — the only
set→echo index there is. its `Rarity` (= nanoka's `intensity_code`) is the echo *class*, not the
cost: 0 Common = 1 cost, 1 Elite = 3, 2 Overlord = 4, 3 Calamity = 4. so a set can have exactly one
4-cost and still have good 3-cost mainslots — Eternal Radiance's only Overlord is Nightmare:
Mourning Aix, but Zani wears Capitaneus, an Elite. slot costs are ceilings, not requirements, so a
3-cost in the main slot is legal and just leaves a point unspent.

# frames
every pressed action declares `animFrames` and its `bullets`; a field's own bullets and
coordinated/response ones (OFF_FIELD-tagged, no `cast`) take no `animFrames`. read them off wuwalab —
`abilities[*]` of `api.wuwalab.com/api/app/characters/<slug>` — or, for a kit wuwalab lacks, off a frame
table the user pastes (the same columns). with neither, list the nanoka row's bullets all at
`animFrames` and mark the action `// PLACEHOLDER FRAMES`:

- `animFrames` = `total_frames`
- one bullet per wuwalab hit, never merged: its `hitFrame` = `hits[*].frame` and its `commitFrame` =
  `hits[*].commit_frame` (left out where the two agree). its mv/energy/concerto/offtune/forte are
  the kit's own totals shared out by wuwalab's per-hit weights (the kit's numbers stay the source of truth)
- `timestop` / `motionStop` are `[start, end)` frame ranges: wuwalab's `time_stop_start`..`time_stop`
  (`motion_stop_start`..`motion_stop`), `end - start` frames from `start` (`[10, 100]` = 90). a
  table's `5-37F` tag is `[5, 37]`, a bare `122F` `[0, 122]`; a kit with neither writes `[0, n]` as a
  placeholder. a zero stop is left out
- `events[*]` are the ability's non-hit happenings (an infliction, a stack gained, `resource_gain`).
  one on a hit's frame is part of that hit: its effect goes in that bullet's own `updateDebuffs`, its
  gauge on that bullet. one between hits stays where the kit already has it, for now
- `animPriority` = `priority_timeline` whole (`[[0,10],[163,2]]` -> `{ 0: 10, 163: 2 }`): a frame
  listed twice keeps the tier listed later (Schemata of Runes' `[[0,9],[0,5],...]` is `{ 0: 5, ... }`); its 0 windows and the windows on or past the last frame stay,
  for the record. `castPriority` = `skill_priority`. a `skill_priority` of 0 over an all-0 timeline
  is missing, not 0. none on an OFF_FIELD hit or an Outro with no animation. a press wuwalab has no priority for
  takes the usual one for its kind, held its whole length: basics and mid-air basics 2, plunges 6,
  heavies 2 (forte heavies 6), dodge counters 8, skills 4, Liberations 10, Intros 11, animated Outros 10, dodges 6,
  echo casts as above
- priority never holds back a swap: `noSwapFrames` = `no_swap` does, gating a swap form or a cut into
  an Outro the way priority gates every other cut (Denia's Final Act - Breakdown 160); left out where it is 0. a kit
  wuwalab lacks takes its `motionStop`'s end
- pair an engine action to its ability by name, then check off-tune/MV agree; a row the kit has no
  action for is left alone, and a kit action with no row keeps what it has — say which
- Tune Break: each weapon class has its own default (tunebreak.ts); a kit whose "Tune Break Skill"
  differs declares `tuneBreak: tuneBreak(animFrames, noSwapFrames, [ts0, ts1], [ms0, ms1], [[frame, mv, commit?], ...])` on its Resonator, or a
  resolver where it depends on form (Aemeath's Mech, Cartethyia's Fleurdelys)
- cooldowns: `cooldown: 60 * s` off the ability's `cooldown` (frames) or nanoka's "... Cooldown" row;
  two presses on one button share a `new Cooldown({ frames })`
- an effect's "once every Ns" that enhances a cast with its own nanoka entries (Suisui's Sky Over
  Water) is that cast's own enhanced action drawing on a shared `new Cooldown({ frames })`, written
  into the rotation so the cooldown is enforced. an Intro's cooldown holds the handoff into it,
  never a wait row

# concerto
a kit is done only when all three sources are read:
1. per-hit `element_power`
2. flat "Concerto Regen" rows in `skill.level[*]` — they *add* on top (5 hits ×2 + "Concerto Regen 20" = 30). most skills/liberations/intros get all their concerto here; intros nearly all carry +10, forte circuits too. bare "Concerto Regen" = the skill's main action, prefixed = that sub-action, "Extra …" = match on words. take the damage row from the *same* skill (MVs collide across skills) and require node/cast to match. regen only adds — a proposal that lowers a value is a mis-match
3. skill/inherent *descriptions* (substitute `param` into `{0}` placeholders, grep Concerto) — put these in a buff via `addGain({ concerto: n })` from the hook the text names, never the action's own, so a re-sync can't overwrite them

also: dodge counters carry a hidden +10; never write 0 over an existing value; "Resonance Cost" = liberation energy cost = `maxEnergy`.

the check: every rotation must reach 100 concerto or its outro can't fire.
