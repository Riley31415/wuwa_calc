# general
- do not read TODO.md
- comments: 1-2 lines max
- never crowd a braced block onto one line: `if (x) { a(); b(); }` is two statements hiding on one, and so is any `{ ... }` body written inline. Give it real lines. Only a single short statement may share the line with its `if`, and only without braces
- read web pages as a human would; never screenshot them
- DO NOT stage changes, commit changes, or push changes to git
- use LF for newlines not CRLF

# implementing kits
- nanoka.cc is the source of truth. the old `migration/` sheet data is gone from the tree — cross-check a
  number that looks wrong against wuwalab or encore.moe, and ask rather than pick
- NEVER invent missing forte values — read them off wuwalab, and ask only if it has none:
  `https://api.wuwalab.com/api/app/characters/<slug>`, `abilities[*].on_cast_forte_N` and per-hit
  `hits[*].forte_N`. **forte there is raw points**, while `motion_value`/`energy`/`concerto` are ×100 and
  `off_tune` is already engine units — check one field against a number the kit text states before
  trusting the rest. it also resolves rows nanoka's own damage entries don't sum to
- forte deltas go on the action (`forte1`..`forte5`), never via manual set calls; they can go negative when
  spent, so there is no floor. the *ceiling* is `maxForte1`..`maxForte5` on the Resonator (48 of 50 kits
  declare theirs) and only bites when a cast spends — the spend starts from the cap, not from the overrun
- a gauge whose real ceiling moves with state (Zani's Blaze: 100, 150 in Inferno Mode) declares the higher
  one as `maxForteN` and clamps the lower itself
- a cast that drains a gauge whole ("depletes all", "consumes the whole bar") sets `resetForteN: true` on
  the action: the gauge zeroes *ahead of* that same action's own `forteN`, so `resetForte1: true, forte1: 200`
  lands on 200. a drain that is **conditional** (only while some buff is held) can't use it — declare the cap
  as a negative delta (`forte1: -200`) and clamp to that cap in the cast's own `updateBuffs`
  (`if (forte1() > 200) setForte1(200)`) so the delta lands exactly at 0. never a bare `setForteN(0)`
- forte/concerto/energy a kit lists elsewhere for a cast go directly on that action
- an inherent that applies only to specific actions = a buff added and removed on just those actions
- flat, unconditional equipment stats go in `stats: [[Stat.X, n, tag?], ...]` (a Buff's `stats` pay while held; `perStack`, `when`, `duration`, `lostOnSwap: true`); a trigger that grants a buff is `grants: [{ on: onCast(...) | onType(...) | onInflict(...) | onApplied(...), buff, stacks?, to?: BuffTarget.Team | BuffTarget.Enemy | BuffTarget.Next }]`; anything the form doesn't fit stays a closure (`applyStats`, `updateBuffs`, ...)
- `ResonanceMode` on a loadout's `mode` is only for a stance a build *commits to* with no cast entering it
  (Hsin's Flare/Unison, Lucilla's Echo/Chafe, Denia's, Aemeath's) — it stands from combat start. a stance
  a cast actually enters is an ordinary Buff that cast grants and the opposite cast revokes (Phoebe's
  Absolution/Confession), so she is in neither until it lands, opening visit included
- slot 1 of a team leads, so its loadout must declare a `NOINTRO` chain or the team is unplayable; writing
  `NOINTRO,` immediately before the Intro shares the whole body with no second copy
- a rotation writes `INTRO` (never the kit's Intro action — that throws) and its own Outro cast
  (`INTRO, ..., Outro`). The Resonator names the Intro INTRO resolves to as `intro:` — the Intro, or
  an `IntroResolver` (`new Action("Intro Resolver", { cast: Cast.Intro, resolve })`) for a kit with
  more than one; a kit with more than one Outro declares an `OutroResolver` and writes that. A
  double-Intro section opens on `DOUBLE_INTRO`; `DOUBLE_INTRO` / `FIRST_INTRO` / `INTRO_n` cast INTRO on
  their own, cut by cutting the marker (`INTRO_2.cancel()`) or by writing the cut one right after
  them (`INTRO_2, INTRO.cancel()`)
- a loadout's `weapons` list its best signature first and its best standard weapon second — with the weapons box closed the solver runs only that one

# wording of buffs
- "lost on swap / switching out" = `lostOnSwap: true` (or `lostOnSwap()` in a hook): lost on the swap-out action — an Outro or insta swap before it pays, a swap cancel after; "while on field" = `isActive()`
- a buff lasts its stated `duration`; with none stated it is permanent
- "all active resonators" = no stat on inactive actions; "all nearby resonators" = applies even when inactive
- "all attribute dmg bonus/amp" = plain dmg bonus/amp, no tag
- a team buff scaled by the applier's own stats: assume the maximum threshold is met
- "when X enters combat, ... (cooldowns reset / gauge restored). This effect can be triggered once every Ns" = a start-of-combat effect (`combatStart`), fired once — never again on a loop or an intro; ignore the cooldown

# naming actions
- an action with a cast is `<Cast> - <name>`: Basic, Mid-air, Heavy, Skill, Liberation, Intro, Outro, Echo, Dodge Counter, Tune Break; the prefix follows `cast`, not `type` (`Dodge Counter - Moonbow` even though it deals Liberation DMG) — except a mid-air press, which reads `Mid-air` though its cast is Basic
- `Forte <Cast> - <name>` only when the action sits in `Node.Forte` AND spends something (a negative `forteN` on the action, or a revoke/removeStack/setForte in its def); a stance's plain presses stay `Basic - Umbra 1`, `Heavy - Incarnation`
- mid-air presses are Basic Attacks: `cast: Cast.Basic` and `Mid-air - <name>` (no "(Mid-Air)" suffix), so `casting(Cast.Basic)` already covers them; there is no mid-air cast type, so a "mid-air attack" clause names its presses with `runningAction(X)`; mid-air heavies/dodge counters keep their own cast and carry "(Mid-Air)" in the name
- a plunging attack is a mid-air press too: `Mid-air - <name>` (`Mid-air - Plunging Attack` for a bare one), and a "mid-air attack" clause lists it alongside the aerial chain — unless its cast is not Basic (`Forte Skill - Undying Sunlight: Plunge`), which keeps its own prefix like any other mid-air non-Basic
- every dodge counter is `cast: Cast.DodgeCounter`, named `Dodge Counter - <chain name>` (a bare one takes the basic chain's name: `Dodge Counter - Captain's Rhapsody`)
- extras after the name go in parentheses: `(Charged)`, `(Hold)`, `(Follow-Up)`, `(S6 Blast)`; sub-moves after a colon: `Thrum: Aero Plunge`. A `.swap()` form keeps its cast's name: the SWAP tag marks it
- actions with no cast (coordinated hits, ticks, fields, responses) carry the source they belong to instead: `Liberation - Marcato`, `Tune Rupture Response - Starburst`

# nanoka data
the damage table is client-rendered — read the CDN json, not the html:
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
every pressed action declares `frames`; a field's own hits and coordinated/response hits (FIELD-tagged,
no `cast`) don't. read them off wuwalab — `abilities[*]` of `api.wuwalab.com/api/app/characters/<slug>` —
or, for a kit wuwalab lacks, off a frame table the user pastes (the same columns):

- `frames` = `total_frames`; `cancelFrames` = `earliest_frame_cancel` exactly as given, 0 included —
  never a later hit, never a fallback. left out, it defaults to `frames`, so any cut of that press
  throws (a cancel can't end later than the press does); only an insta cut can be made
- `timestop` / `motionStop` are frame ranges, start..end inclusive where a start of 0 is frame 1:
  the span is `end - max(start, 1) + 1` (Qingxiao's Intro motion stop 3-31 = 29, a 0-180 time stop
  = 180). a table's `5-37F` tag reads the same way (33); a bare `122F` is the whole 122. a zero
  stop is left out
- `priority_timeline` ("0:11, 60:0"): a cancel frame can't fall inside a stretch of priority 11+ —
  move it to the frame that stretch ends, or to `frames` if it never drops (Jingran's Intro 43 -> 60)
- pair an engine action to its ability by name, then check off-tune/MV agree; a row the kit has no
  action for is left alone, and a kit action with no row keeps what it has — say which
- Tune Break: each weapon class has its own default (tunebreak.ts); a kit whose "Tune Break Skill"
  differs declares `tuneBreak: tuneBreak(frames, timestop, motionStop)` on its Resonator, or a
  resolver where it depends on form (Aemeath's Mech, Cartethyia's Fleurdelys)
- cooldowns: `cooldown: 60 * s` off the ability's `cooldown` (frames) or nanoka's "... Cooldown" row;
  two presses on one button share a `new Cooldown({ frames })`

# concerto
a kit is done only when all three sources are read:
1. per-hit `element_power`
2. flat "Concerto Regen" rows in `skill.level[*]` — they *add* on top (5 hits ×2 + "Concerto Regen 20" = 30). most skills/liberations/intros get all their concerto here; intros nearly all carry +10, forte circuits too. bare "Concerto Regen" = the skill's main action, prefixed = that sub-action, "Extra …" = match on words. take the damage row from the *same* skill (MVs collide across skills) and require node/cast to match. regen only adds — a proposal that lowers a value is a mis-match
3. skill/inherent *descriptions* (substitute `param` into `{0}` placeholders, grep Concerto) — put these in a buff via `addStat(Stat.AddConcerto, n)`, never the action's `concerto`, so a re-sync can't overwrite them

also: dodge counters carry a hidden +10; never write 0 over an existing value; "Resonance Cost" = liberation energy cost = `maxEnergy`.

the check: every rotation must reach 100 concerto or its outro can't fire.
