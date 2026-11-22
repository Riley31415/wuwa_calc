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
  ..., Outro`): an arrival with no Intro resolves its `swapIn`/`swapInAir` and plays the chain opening on
  that press, throwing where none does (a lone chain stands, its first press checked as it is cast)
- an Intro chain opens on the kit's own Intro, or every Intro it could open on written back to back
  (`Intro, EIntro, ..., Outro`), each cut alike (`Intro.cancel(), EIntro.cancel()`); an Intro written
  further in is another place the chain starts — an arrival starts on the Intro `intro:` picks and
  passes every other one it reaches by. It closes on the one Outro that section really leaves on
  (`OutroUnison` where the visit lands Unison, else `Outro`): two in a row throws, and an Outro cast
  outside its condition warns like any press (`unisonOutro()` requires UNISON). An Outro short of its Concerto first
  waits for its owner's hits still to land, cast as the one that fills it lands; never filled, it warns.
  The Resonator names the Intro an arrival casts as `intro:` — the Intro, or for a kit with more than
  one the function picking it (`intro: () => (isHeld(X) ? EIntro : Intro)`), never a resolver
  Action; it has no `outro:`. `dodge:`, `airDodge:` (the dash made in mid-air; unset is `Dodge - Mid-air`, the grounded dodge cast at 7) and `jump:` take an Action or `(after) => ...` alike. The
  arrival plays the chain listing the Intro `intro:` picks, and throws where none does: a rotation
  may give each Intro a chain of its own or list several in one, but never one in two chains of a
  kind. `.firstIntro()` (the first arrival), `.inFirstSlot()` / `.inLastSlot()` (a team position),
  `.doubleIntro()` (the pre-visit) and `.firstDoubleIntro()` (the first pre-visit) on an Intro open
  the special chains, each Intro of a run marked alike (`Intro.inLastSlot().mashCancel()`); a
  first-arrival or position chain stands in only for the Intros it lists

# chains and positions
- `after: [X, ...]` lists the presses an action may directly follow: its owner's last own press this
  visit, any form of it (cuts, swap forms); DODGE/JUMP stand for any press of that cast. unset
  follows anything (a Basic 1). read them off the kit text: stage n follows n−1, plus whatever the text
  leads into it ("follow up with Basic Attack to start the cycle from Stage 2"); every dodge counter `[SUCCESSFUL_DODGE]` (engine/rotation.ts), which nothing inserts: a rotation writes it right before the counter.
  a press outside its `after` throws; OFF_FIELD presses neither check nor count
- `notAfter: [X, ...]` lists the presses an action may *not* directly follow, read the same way and
  whatever `after` allows: where its button would give another press instead. stage 1 of every string
  lists every press its later stages name in `after` — stages 1..n−1, and the Intro, dodge counter or
  skill the text leads into a later stage — never the last stage, which pressing again restarts from.
  it reads the last press and every chain that press saved (a summon echo, a string kept through a dodge or Heavy).
  an auto Tune Break waits where the next press bars it
- an effect setting up a later press ("the next mid-air Basic Attack starts at stage 2", a string carried
  through a dodge) saves the press it stands in for: `saveChain(MA1)`, or `saveChain(previousPress())` on
  the dodge's cast. a press failing its `after` spends the first saved chain it follows; arriving empties them.
  a summon echo (`keepsChain`) saves the press before it, and the auto Tune Break saves itself: a press the
  text says follows a Tune Break lists `TUNE_BREAK`
- `castPosition`/`endPosition` (`Position.Grounded`/`Midair`): mid-air presses need MIDAIR, a plunge lands
  GROUNDED, every jump lifts to MIDAIR, dodges change nothing; castPosition only where the text restricts a
  press. a press cut within 6f (an insta cut, a mash at 6) leaves them where they stood, a jump aside. every Intro declares `endPosition` (GROUNDED unless its text leaves them in the air)
- 18f (`DESPAWN_TIME`) past its last press a resonator off field despawns. an arrival still standing keeps
  its position; a despawned one takes the outgoing one's (the fight's first actor and START: GROUNDED). the Resonator's `swapIn`/
  `swapInAir` name the press an arrival with no Intro (SWAPIN, START) must open on, skipping its own `after`/`notAfter`
  (Basic 1 and the mid-air Basic 1 or plunge for most, Phrolova Basic 2): `BA1.instaCancel()` where needed
