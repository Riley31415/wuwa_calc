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
- cuts: `cancel`/`dodgeCancel`/`jump`/`swapCancel` cut at `cutFrame` — the last bullet's
  commit — then the animation runs on past the cut: `CANCEL_DELAY` (9), a swap cancel's too; an
  insta cut or insta swap `INSTA_DELAY` (6). the swap forms are `swapCancel` (SWAP CANCEL), `instaSwap` (INSTA SWAP, swapping
  the moment it is pressed) and `mashSwap` (MASH SWAP, `MASH_DELAY` (3) after its `noSwapFrames` end, throwing where that is
  its animation's end or later); a swap cancel or insta swap inside `noSwapFrames` throws (write
  the mash swap). a swap form goes last in its chain or section, or right before an Outro with no
  animation frames — before one with any it throws: write the plain cut (`.cancel()`, which keeps
  every hit an insta swap did); a plain cut into an Outro with none throws: write a swap form. where no Outro follows, the scheduler plays `SWAP` after it — no frames, no
  cast, a dimmed row, read as `Swap - Grounded` / `Swap - Mid-air` for where the one swapped in will stand; the swap form's own delay is the handoff; an Outro
  otherwise hands over with no delay at all (a test overrides any delay with `setDelays()` before the kits load). a rotation may write `SWAP` itself after a press it plays out
  (`MA4, SWAP`): it waits out `CANCEL_DELAY` on a `Wait … for Swap` row first, and closes its chain or section like a swap form; never right
  before an Outro. the cast of a `SWAP` or of an Outro is the only thing that takes
  a resonator off the field (lost on swap, the field handed on); the swap form itself never does, and
  plays on behind the swap to its own end — until its owner presses again, which ends it there (its
  hits a hold kept past their own frame landing first). any cut into an Outro inside `noSwapFrames`
  or under its priority throws, a mash cancel aside, which waits out both. a `holdCancel` / `mashCancel` instead lets go the moment the next press can come out —
  its cast condition met (`minConcerto`, `maxForte2`, `requireBuff`, ...; on its cast or on a bullet, an earlier press's
  still-landing ones included) and the window below open — at its last bullet if the condition never is; the next press
  starts right there: bullets not committed by then are lost. a hold goes only into a held input (`heldInput`: every
  `Cast.Heavy` by default, and a Skill or Basic hold that says so), a mash only into a press that isn't; a hold lets
  go no earlier than `HOLD_MINIMUM` (6), a mash `MASH_DELAY` (6) after the moment it could, its input landing on the
  next tap; either throws where it lets go at the press's end. `HOLD_BUFFER` (16) is unused for now. a cut that runs longer than the whole press, or cuts inside `INSTA_DELAY` (6), throws.
- a transform (13+ animation priority) may be swapped out of, but holds its owner until it drops below 13: a swap-in or Intro into them before then throws (`Slot.arrive`); their own next press ends it
- swap cooldown: leaving the field (a swap or an Outro) starts 60 real frames (they run through time stop) before a swap may bring that member back, else it throws (`TeamMember.swappedInto`); an Intro into them bypasses and clears it, and leaving during their own Intro starts none. An exit resolver that plays a plain `SWAP` hands over as a swap form: the next member opens on their SWAPIN chain
- priority: a press's `animPriority` (`{ 0: 5, 10: 2 }`, frame -> tier) is what it holds while it
  plays, its `castPriority` what it cuts in at; one press cuts another only with a `castPriority`
  above the other's `animPriority` at the frame it starts on (the cut and its delay played), and every
  press beats the floor of 0, so a press cast at 0 (or declaring none) throws — a cast-less one with
  hits included; what the engine queues aside, and a wait, never does. a plain, on-hit or insta cut that fails it throws — a dodge or jump cut
  weighs the dash (the plain dodge casts at 6, the jump at 8, both holding 9, the jump 6 frames long; after any `cast:
  Cast.Echo` press, never a subcast, the dodge is `Dodge - Out of echo`, casting at 14), the rest the
  next press. a hold or mash waits for it
  instead — a mash into an Outro for the press's `noSwapFrames` too — a hold letting go the frame the
  window opens, a mash `MASH_DELAY` after it, and throws where it lets go no earlier than the press would end. an OFF_FIELD hit and an Outro with no animation carry no priority; an Outro with
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
  wuwalab's `airCastable: false` = `castPosition: Position.Grounded`. a multi-stage echo (wuwalab's
  "X 1", "X 2", ...) is an action a stage, all on one mainslot, each chaining off the last (`after:
  [X_1.press]`), the cooldown on the first; a rotation writes as many stages as it presses.
  an insta cut keeps the bullets committed by `INSTA_DELAY`; `.cancelOnHit()` (CANCEL ON HIT),
  `.dodgeOnHit()` and `.jumpOnHit()` cut `CANCEL_DELAY` after the first bullet hits, keeping the
  bullets committed by the end of that delay — bullets keep firing until the next press truly starts; each throws on a press whose bullets hit on one frame.
  `.timedCancel(n)` (CANCEL @ Nf) cuts at animation frame n exactly, no `CANCEL_DELAY`, keeping the bullets
  committed by n; the next press still has to out-prioritise it there, and n at or past `animFrames` throws
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
