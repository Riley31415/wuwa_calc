# engine
How a press plays: cuts, hold and mash, priority, echo casts, hooks and timers — read before writing
hooks, cuts or anything timing-sensitive.

# fight length
a fight plays its rotations round the team until the game timer reaches 2:00 (`FIGHT_FRAMES`, so time
stops pause it), then is cut: nothing is pressed past it (`State.fightEnd`) and no hit past it lands.
DPR is the average of the sections that closed by then, the opener included; DPS is every hit inside
the 2 minutes over 120s. the action log shows the whole 2 minutes; the Contribution table only the opener and loops 1-3

# cast and hit
every press is a cast plus its `bullets` — each `{ hitFrame, commitFrame?, mv, energy, concerto, offtune,
forteN, element?, type?, subtype?, updateDebuffs?, hitGlobal? }`, landing at its `hitFrame` — plus an end
where the press runs out. a bullet's `commitFrame` (default `hitFrame`) is where it is guaranteed: a cut
after it can't stop it. the action itself has no element/type/subtype: a def's own are only what its
bullets share. no `bullets` = a cast alone that deals as nothing. an action has no `mv` of its own:
every motion value is a bullet's
- solved transitions (being verified; the old written cancels below still play the fight): a rotation writes a
  press's intended `Timing` — `LastCommit` unwritten, `.instant()`, `.firstHit()`, `.timed(n)` — and any DASH/JUMP/SWAP
  itself; the engine solves the cut into the next written press, "valid at f" meaning that press comes out at
  frame f of this one (past its priority, transform and no-swap frames, its conditions met on the bars banked by
  f, buffs as they stand when it is reached). with `TRANSITION_CHECK.on` each solve lands in `TRANSITION_CHECK.found`
  beside the cut that played (`Result.cutAt`); an old cancel reads as instant, on hit and timed as written, every other
  as last commit.
  - every press with no old cancel is watched as the fight plays (`TransitionWatch`), at its timing or, none written,
    last commit (never written: `.lastCommit()` is the default): it holds the field for as long as any timing could cut it, and each frame, everything due
    there played, records what the fight shows — the next press available, castable, mashing its input safe — then
    cuts on the first frame the timing's rules (`cutsAt()`) are met on frames already seen, with no look-ahead: buffs its own hits
    grant, gauges its hooks fill, all read as they really land. none by its horizon: it throws; the fight ending first
    ends the watch. it ends where its animation runs out (its `afterAction`, the chain), or at its cut where that is
    sooner: from its last frame on, nothing it holds keeps the next press out. the next press is read as following
    the chain the cast left (`chainAs()`, a press that keeps it). a resolver written next is resolved again each frame
    (its form may change as the hits land). every other press plays its old cancel; the check of an old cut (`TRANSITION_CHECK`) still
    predicts, since past that cut the fight no longer shows what would have come. to what still reads an old cut (the Tune Break's openings) it stands for the instant cancel inside
    `INPUT_PRECISION`, else the plain one — through a dash or jump where that is the next press
  - a DASH or JUMP is a press like any other, watched at last commit (frame 0: cut `INPUT_PRECISION` on, or where
    the next press opens): its member's own valid there, else the plain one where they declare none; none valid,
    they can't dash — it resolves to `NO_VALID_DASH`/`NO_VALID_JUMP`, never castable ahead, refused where reached.
    a ready Tune Break may take a written DASH's place. a watched press's break (in a dash's place or ahead of
    the next press) is solved as any other press: it comes out at the cut only where the press's timing would bring
    it out there (`cutsAt()`: ready on every frame of a precise cut's `INPUT_PRECISION`, or buffered)
  - a DASH or JUMP written right after a press that is skipped (`SKIP`) is skipped with it
  - a plan ahead of play (`chainGates()`: an Outro waiting on the next visit's cooldowns) reads a press written with a
    timing as the cut it last played this fight (`State.playedCuts`); not played yet, as the old cut its timing
    stands for (`PLANNED_CUT`), or into a held press where that press can follow it from its target
  - a swap (a written SWAP, or an Outro with no animation) cuts nothing: the press plays on behind it, every hit
    landing, so it is solved over the hits still to come past the animation's end. a swap is never buffered: it is
    always precise, `INPUT_PRECISION` after its target or after it opens there (no-swap frames ending, an Outro's
    Concerto banked); a solved swap pays the swap: the SWAP after it waits nothing more. rotations write
    `X.instant(), SWAP` (or `, Outro`); a run of mainslot echoes takes one SWAP after it
  - compile time: instant throws where the last commit is at `INPUT_PRECISION` or sooner (use last commit), else where
    the first hit is (use first hit): either lands `INPUT_PRECISION` after it
  - available (`Action.available()`/`availableOn()`): every condition a press declares is met, and no press above it on
    its input (`inputPriority`) has its own met — it is what its input gives. two at one priority with theirs met
    (a charge ready) is a tie, which throws. castable at f: available there, and this press's priority, transform and
    no-swap frames let it out
  - not a held input: timed n must be castable at n. instant, first hit and last commit aim at 0 / the first hit /
    the last commit and take the first frame f from the target either way makes, searched past the animation's end
    (to the last hit still landing): precise, aimed at f - `INPUT_PRECISION` (from the target on), castable through
    every frame from the aim to f (instant's aim at frame 0 need only be available); buffered (never a swap), castable at f after
    `INPUT_PRECISION` frames (from the cast on) it wasn't, its input giving no other press through them (that press
    would come out). none: "cancel automation failed"
  - a held input never reads what its tap would give: pressed `INPUT_PRECISION + HOLD_BUFFER` (22) before it comes
    out, from that long before the target on (target 100: pressed at 78, out at 100 where castable, else the first
    castable frame after), and never sooner than `INPUT_PRECISION` before this press's cast, so out at 12 at the
    soonest; timed n must be castable at n, n at least `HOLD_BUFFER`
  - each throws where it cuts later than another timing aims: first hit or instant at or past the last commit (use
    last commit), instant past the first hit where first hit is allowed (use first hit)
  - the row's tag box reads the cut (`cutAt`) and the next press's input alone: none where it played out; red at or
    inside `INPUT_PRECISION`, yellow short of the last commit, blue past it; DASH/JUMP/SWAP for a next press on Dash
    (or Successful Dodge), Jump or Outro, else CANCEL; `@ Nf`. its panel names the old written cancel
- off field: a press with no input but a cast or a bullet plays beside the fight (a wait has neither), and so does
  the swap; `onField: true` keeps one on field (its owner's own animation carrying on, Brant's flips). the log dims
  those and Outros by input
- transitions: every press hands over to the next by a `Transition` (`.cancel()`, `.mashSwap()`, ...): a
  timing (`TIMING_OF`) through the next press itself or a dash, jump or swap the transition puts in
  (`VIA_OF`, which must be valid there or it throws). the next press starts at the frame the cut aims at plus
  its delay; past the animation's end that delay plays with nothing animating. `INPUT_PRECISION` (10),
  `HOLD_BUFFER` (12):
  - lastcommit (`cancel`, `dashCancel`, `jumpCancel`, `swapCancel`): aims at `cutFrame` (the last commit), + precision
  - instant (`instaCancel`/`instaDash`/`instaJump`/`instaSwap`): aims at 0, + precision, keeping the bullets committed by then
  - onhit (`hitCancel`/`hitDash`/`hitJump`/`hitSwap`): aims at the first hit, + precision, keeping what commits by then
  - mash (`mashCancel`/`mashDash`/`mashJump`/`mashSwap`): the first frame the next press can come out, no
    sooner than precision, no delay; into a swap or an Outro (a mash swap's included) it is never buffered: precision
    after the frame it opens (its `noSwapFrames` ending, its Concerto banked)
  - hold (`holdCancel`): the first frame the next press can come out, no sooner than precision + `HOLD_BUFFER`, no delay
  - timed (`cancelAt(n)`): frame n exactly, no delay. `OffField`: beside the fight. `Chain`: not detected yet
  - `Temporary` (nothing written): the next press starts as this one ends, no delay
- what a transition throws: a lastcommit, onhit or mash transition aiming at frame 0 (write the instant one); a plain
  or instant cut into a held input (write a hold cancel), a hold into one that isn't, a mash into one that is;
  a mash whose next press can't come out before the animation ends, a hold letting go at its end or later.
  the swap forms are `swapCancel`, `instaSwap`, `mashSwap` and `hitSwap`; one swapping inside `noSwapFrames` throws (write
  the mash swap). a swap form goes last in its chain or section, or right before an Outro with no
  animation frames — before one with any it throws: write the plain cut (`.cancel()`, which keeps
  every hit an insta swap did); a plain cut into an Outro with none throws: write a swap form. where no Outro follows, the scheduler plays `SWAP` after it — no frames, no
  cast, a dimmed row, read as `Swap - Grounded` / `Swap - Mid-air` for where the one swapped in will stand; the swap form's own delay is the handoff; an Outro
  otherwise hands over with no delay at all (a test overrides any delay with `setDelays()` before the kits load). a rotation may write `SWAP` itself after a press it plays out
  (`MA4, SWAP`): it waits out `INPUT_PRECISION` on a `Wait … for Swap` row first, and closes its chain or section like a swap form; never right
  before an Outro. the cast of a `SWAP` or of an Outro is the only thing that takes
  a resonator off the field (lost on swap, the field handed on); the swap form itself never does, and
  plays on behind the swap to its own end — until its owner presses again, which ends it there (its
  hits a hold kept past their own frame landing first). any cut into an Outro inside `noSwapFrames`
  or under its priority throws, a hold or mash aside, which waits out both. a hold or mash lets go once the next press can come out —
  it valid (its conditions read on the bars its cast and bullets bank, an earlier press's still-landing ones included,
  else as the fight plays — a buff landing) and the window below open; bullets not committed by then are lost.
- a transform echo casts and holds at 5 (wuwalab's `skill_priority`) with `transformFrames` over its whole animation: inside them only a Dodge-input press cuts it — a mash or hold cancel into anything else waits them out, a plain cut throws — while a swap or an Outro is free. it holds its owner through them: a swap-in or Intro into them before then throws (`Slot.arrive`); their own next press ends it
- dodge lockout, on the dodge definitions alone (rotation.ts): every press on Dodge, a kit's own and a successful dodge included, `grants: DODGE_GRANTS` and `lacks: GROUND_DODGE_LACKS` (`AIR_DODGE_LACKS` for a mid-air one). a ground one starts a hidden 0.5s window, and a second inside it gives `No Dash/Dodge` (1s, no dash of any kind); an air one gives `No Air Dash/Dodge` until grounded or a transform echo
- swap cooldown: leaving the field (a swap or an Outro) starts 60 real frames (they run through time stop) before a swap may bring that member back, else it throws (`TeamMember.swappedInto`); an Intro into them bypasses and clears it, and leaving during their own Intro starts none. An exit resolver that plays a plain `SWAP` hands over as a swap form: the next member opens on their SWAPIN chain
- priority: a press's `animPriority` (`{ 0: 5, 10: 2 }`, frame -> tier) is what it holds while it
  plays, its `castPriority` what it cuts in at; one press cuts another only with a `castPriority`
  above the other's `animPriority` at the frame it starts on (the cut and its delay played), and every
  press beats the floor of 0, so a press cast at 0 (or declaring none) throws — a cast-less one with
  hits included; what the engine queues aside, and a wait, never does. a plain, on-hit, instant or timed cut that fails it throws
  (nothing holds past the animation's end) — a dodge or jump cut
  weighs the dash (the plain dodge casts at 6, the jump at 8, both holding 9, the jump 6 frames long; after any `cast:
  Cast.Echo` press, never a subcast, the dodge is `Dodge - Out of echo`, casting at 14), the rest the
  next press. a hold or mash waits for it
  instead — into an Outro for the press's `noSwapFrames` too — a hold letting go the frame the
  window opens, a mash too (see transitions). an OFF_FIELD hit and an Outro with no animation carry no priority; an Outro with
  animation frames is cut into like any press
- echo casts: a summon casts at 10 as the next press starts and never cuts the press before it (`castsWithNext`: that press's cut, hold or mash is made by, and weighed against, the press past the summon), holding 8 (a Liberation cuts it); a transform ("Transform into ...") at 5, holding 13; a
  pseudo-transform (wuwalab's `semi_transform`: Bell-Borne Geochelone, Mech Abomination, Chisa's
  Threnodian - Leviathan, Thousand-Puppet Pavilion) at 5, holding 4; the class follows wuwalab's `type`. an echo's cast is a `SummonEcho` (8 frames), `TransformEcho` (60) or
  `PseudoTransformEcho` (8) from `src/echoes/echo.ts`, which fills in its cast, frames and
  priorities; its def only overrides what differs. the cast takes the echo's own name (`FALLACY`), its Mainslot the same with `_MAINSLOT` (`FALLACY_MAINSLOT`). it names its `mainslot:` (the Mainslot names no
  action) and is a resolver: it plays only while that mainslot is worn, skipped with its cut and dash
  otherwise. there is no ECHO marker — a rotation writes one cast per mainslot the character may wear,
  side by side, each cut its own way (`HERON.instaSwap(), FALLACY.instaSwap(), Outro`); a run
  of them all swaps out or none does. echo frames are wuwalab's (`/api/app/echoes/<slug>`); a transform's
  hits commit at wuwalab's own `commit_frame`, which already lands ahead of the hit (the transform staying on
  field to finish its attack), so its def lists that `commitFrame` (left out where it is the hit's).
  wuwalab's `airCastable: false` = `position: Position.Grounded`. a multi-stage echo (wuwalab's
  "X 1", "X 2", ...) is an action a stage, all on one mainslot, each chaining off the last (`after(X_1.press)`),
  the cooldown on the first; a rotation writes as many stages as it presses.
  a timed cut (CANCEL @ Nf) keeps the bullets committed by n; the next press still has to out-prioritise it there.
  a dash a cut puts in that the next press out-prioritises is itself cut instant
- an Intro's `qteFrames` (default 0, Intros only, wuwalab's `qte_tag_frame`) is where the Outro's own
  buffs land (`queueQTE`), their durations starting there. every other handoff — a sonata's, an echo's,
  a sequence's or inherent's riding the outro, a marker — is `queueOutro`, landing as the Intro is cast
- every hook runs on one side of the press: the cast, a hit, or the end. `currentCast()` is the press
  (its name, node, `castX`) in any of the three; `currentHit()` is the bullet landing (its own `mv`,
  `forteN`, `index`, ...) and only in a hit's hooks — it throws on a cast or at the end. an action
  has no combined `forteN`/`energy`/`concerto`/`offtune`: read the cast's `castX` or the hit's own
- cast: `updateGlobal` (every slot's gear), then `updateBuffs` and plain `grants`. `casting()` grants,
  stance switches, spends on cast, Outro handoffs (`queueQTE` for the Outro's own buffs, `queueOutro`
  for the rest — an Outro's bullets land after the next Intro), `respondToUnison`. a cast has no type: never ask `isType()`/`onType` there. a press with no
  `bullets` is a cast alone: none of the hit's hooks run for it, so what it does (a heal marker, a
  gain) goes in its cast hooks, and a status it lays goes on a bullet that deals nothing
  (`{ hitFrame: 0, element: null, type: null, subtype: null, updateDebuffs }`)
- what a hook adds to a gauge beyond the press's declared `castX`/bullet gains goes through
  `addGain({ energy, concerto, forteN, offtune, directOfftune })` — from a cast hook it banks with the
  cast, from a hit's own hooks ahead of its damage (`updateDebuffs`, `hitGlobal`) with that hit, and
  from anywhere else (a buff's `tick`, `afterAction`) straight onto the bars where it is made — flat,
  in no row's hover ("4 Energy a second for 5s" is a 60f tick calling `addGain`). there is
  no gauge stat: a stat hook never adds to a gauge (the engine throws)
- what `addGain()` adds is flat — not scaled by ER or the Energy Regen Multiplier and not shared with
  the team; only a bullet's own energy is both. its `offtune` is built like a hit's own (Off-Tune
  Buildup Rate and its multiplier), so only a hit's own hooks may add it (a cast hook throws); its
  `directOfftune` lands on the bar as it is
- every hit: the action's own and the hit's own `updateDebuffs`, every held Gear's, then the same for
  `hitGlobal`, the grants reading inflictions (`onInflict`/`onApplied`/`inflicting(...)`), the stat
  phases, then `afterHit` and the `onHit` grants after the hit's damage. all of it runs on every hit:
  what a press does once (a status it lays, a heal marker, a queued follow-up) goes on the hit that
  does it (`bullets: [{ hitFrame, ..., updateDebuffs }]`) — a held Gear's effect on one action goes there too,
  reading the Gear (`isHeld(S3)`), rather than the Gear asking `runningAction(X)` on every hit
- end: `afterAction`, where the press stops — a cut one at its cut frame plus the cut's delay, ahead of
  any committed bullet still to land; a swap form at its animation's end (or its owner's next press);
  an uncut one past its last bullet. state the press ends (a stance, a window it closes) goes here, and
  a hit landing behind it no longer finds it. `runningAction(X)` stays true on every bullet of X
- stats pay into hits only: a cast runs no stat hook, so what it banks (`castEnergy`, `castOfftune`, a
  cast hook's `addGain()`) is flat — not scaled by ER, the Energy Regen Multiplier or Buildup Rate, and
  `castEnergy` not shared with the team. the stat hooks (`applyStats`, `convertStats`, `lateConvertStats`,
  `constantStats`) only write stats: no buff, debuff, gauge, queue, gain or `lostOnSwap()` changes
  there (the engine throws). a buff the press consumes pays in applyStats and is revoked by the hit
  that pays it last — a guarded `afterHit` on `lastHit()`, which a cut ahead of it still lands (Denia's
  Dark Core); `afterAction` only where the press has no bullets. nothing is split across a press's hits: each hit has its own resource values and a
  stat hook's adds pay on every hit in full. a gain the press makes once on cast ("+30 Concerto on
  cast") is `addGain()` from a cast hook; a gain one hit makes, gated on gear (a sequence's "+30
  Substance when it hits"), is that gear's `updateDebuffs` calling `addGain()` on that bullet alone
  (`runningBullet(X, k)`), so it pays once and is sourced to the gear. a hook re-adding a hit's own
  gain reads `currentHit()`
- a gauge a cast converts ("consumes every crystal") is spent in `updateBuffs`, off what the cast
  found — a stat hook re-reads it on every hit
- two timers: the real timer (`State.real`) runs every animation, bullet and queued hit, time stop
  or not; the game timer (`State.frame`) is it less every frozen frame, and is what buffs, cooldowns,
  tick clocks (Denia's Erosion Field pulls, Maestro's note timer) and the table run on. a press's time
  stop freezes the game timer from its start for its whole length, what outlasts the animation
  included (banked: the presses after it play inside it), and a new time stop cuts off whatever of
  an earlier one is still to run. never subtract time stop by hand — `gameOf()`/`realOf()` convert
- off-field time: a press's motion stop holds only what animates off field — every inactive
  resonator's queued hits, a swapped-out press playing on, and a field's clock (a Gear with `field`,
  `skipMotionStop` always) — on the real timer, for as long as it lasts, a new motion stop cutting off
  the rest of the old the same way. a buff's own clock (a regen, a drain, a status, a stack timer)
  never pauses: it runs on the game timer like its duration. a cooldown's wait runs on the game timer; an animation hold (Hecate) on the
  real one. a queued event (`queueEvent()`, the auto Tune Break) waits for the press playing to end, and
  the Tune Break is never set off while a time stop stands or is still to come (Xiangli Yao's banked
  Liberation stop): the first press ending past it fires it
- the row sums its hits' damage/mv/gauges and shows the last hit's stats; `applied()` and friends
  see only the part being run
