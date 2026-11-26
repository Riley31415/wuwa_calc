# rotations
Rotation markers, Intro chains and press order — read before writing or changing a rotation.

# writing a rotation
- `ResonanceMode` on a loadout's `mode` is only for a stance a build *commits to* with no cast entering it
  (Hsin's Flare/Unison, Lucilla's Echo/Chafe, Denia's, Aemeath's) — it stands from combat start. a stance
  a cast actually enters is an ordinary Buff that cast grants and the opposite cast revokes (Phoebe's
  Absolution/Confession), so she is in neither until it lands, opening visit included
- slot 1 of a team leads, so its loadout must declare a `SWAPIN` chain or the team is unplayable; writing
  `SWAPIN,` immediately before the Intro shares the whole body with no second copy. like Intros, a rotation
  may write one SWAPIN chain per press a swap-in can open on (`SWAPIN, BA23..., Outro, SWAPIN, CurtainCall,
  ..., Outro`): an arrival with no Intro picks its `Input.SwapIn` press and plays the chain opening on
  that press, throwing where none does (a lone chain stands, its first press checked as it is cast)
- an Intro chain opens on the kit's own Intro, or every Intro it could open on written back to back
  (`Intro, EIntro, ..., Outro`), each cut alike (`Intro.cancel(), EIntro.cancel()`); an Intro written
  further in is another place the chain starts — an arrival starts on the Intro it casts and
  passes every other one it reaches by. It closes on the one Outro that section really leaves on
  (`OutroUnison` where the visit lands Unison, else `Outro`): two in a row throws; a written Outro that
  isn't valid gives way to the kit's Outro that is (`unisonOutro()`'s is valid while UNISON is held, one
  `inputPriority` above the plain one), else plays and warns like any press. Every resonator's Outro input also
  holds `SWAP` (-1), valid below a full Concerto where none of its own Outros is: a marker that leaves either way
  resolves to `pickInput(currentMember(), Input.Outro)` (Havoc Rover's `OutroOrSwap`). An Outro short of its Concerto first
  waits for its owner's hits still to land, cast as the one that fills it lands; never filled, it warns.
  The Intro an arrival casts is the highest-`inputPriority` one of the Resonator's `actions` on `Input.Intro`
  whose conditions hold; the first listed where none does. A dodge, jump or Tune Break is picked the same
  way on its input, after the press it cuts, off one list per input: the kit's own and the defaults
  (`Resonator.defaultActions`: `Dodge - Grounded` / `Mid-air`, `Jump`, `Swap`) at -1, which a kit never
  lists; the weapon's Tune Break only where the kit lists no Tune Break of its own. A pick takes the highest valid press with a cooldown charge, else the
  valid one waiting on its cooldown. The
  arrival plays the chain listing the Intro it casts, and throws where none does: a rotation
  may give each Intro a chain of its own or list several in one, but never one in two chains of a
  kind. `.firstIntro()` (the first arrival), `.inFirstSlot()` / `.inLastSlot()` (a team position),
  `.doubleIntro()` (the pre-visit) and `.firstDoubleIntro()` (the first pre-visit) on an Intro open
  the special chains, each Intro of a run marked alike (`Intro.inLastSlot().mashCancel()`); a
  first-arrival or position chain stands in only for the Intros it lists

# chains and positions
every press's whole condition is its condition fields, ANDed, the chain and the stand read first:
`after: () => [BA1], position: Position.Grounded, holds: STANCE, minForte1: 300` (see resonators.md). a press cast where it
reads false reads red and warns once per team; OFF_FIELD presses neither check nor count
- `after(X, ...)` — the press directly follows one of these: its owner's last own press this
  visit, any form of it (cuts, swap forms); DASH/JUMP stand for any press of that cast. left out, it
  follows anything (a Basic 1). read them off the kit text: stage n follows n−1, plus whatever the text
  leads into it ("follow up with Basic Attack to start the cycle from Stage 2"); every dodge counter `after(SUCCESSFUL_DODGE)` (engine/rotation.ts), which nothing inserts: a rotation writes it right before the counter.
- `notAfter(X, ...)` — the press may *not* directly follow these, read the same way, only where no other
  press takes its button there. a string needs none: stage n `after(stage n−1)` sits one `inputPriority`
  above the stage before it, so stage 1 is outranked wherever a later stage follows. it reads what the
  press follows: the last press, or what an effect stood in for it (`chainAs()`).
  an auto Tune Break waits where the next press can't follow it (`Action.missesOn()`)
- an effect setting up the next press ("the next mid-air Basic Attack starts at stage 2", a string carried
  through a dodge) stands a press in for the one being cast, which the chain then never sees: `chainAs(MA1)`, or
  `chainAs(previousPress())` on the dodge's cast — never a later stage listing `DASH` in its `after()`. a
  summon echo (`keepsChain`) leaves the press before it standing; arriving clears it. a window lasting past the
  next press (Suoming's Engraved Heart) is the window's buff (`holds`), not a chain. the auto Tune Break stands
  itself in (`chainAs(TUNE_BREAK)`): a press the text says follows a Tune Break lists `TUNE_BREAK`. a press the
  text says follows a dodge as such (Brant's mid-air Stage 3) lists `DASH`
- `position: Position.Grounded`/`Midair`, and `endPosition` (`Position.Grounded`/`Midair`): mid-air presses need
  `midair()`, a plunge lands GROUNDED, every jump lifts to MIDAIR, dodges change nothing; a stand only where
  the text restricts a press. a press cut within 6f (an insta cut, a mash at 6) leaves them where they stood, a jump aside. every Intro declares `endPosition` (GROUNDED unless its text leaves them in the air)
- 18f (`DESPAWN_TIME`) past its last press a resonator off field despawns. an arrival still standing keeps
  its position; a despawned one takes the outgoing one's (the fight's first actor and START: GROUNDED). an arrival with no Intro
  (SWAPIN, START) opens on the kit's press on `Input.SwapIn` that is valid there, its `after()`/`notAfter()` reading
  true and the rest of its conditions as written, the same on arrival as anywhere, the highest `inputPriority`
  on `Input.SwapIn` first. an action has one input: the swap-in press is a copy of it, `BA1.swapIn()`, listed
  in `actions` beside `BA1` (Basic 1 and the mid-air Basic 1 or plunge for most, Phrolova Basic 2); the
  rotation still writes `BA1` (`BA1.instaCancel()` where needed). `.held()` and `.onInput(input)` copy the same way
