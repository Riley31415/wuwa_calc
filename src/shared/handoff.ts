/**
 * The 15s Outro→Intro handoffs that carry no "lost on switching out" clause — Impermanence Heron,
 * Moonlit Clouds, Hyvatia, Glommoth, Trickster, Voidwing Moth, and Wishes of Quiet Snowfall's own
 * outro branch.
 *
 * Fifteen seconds of real time outlast the receiver's own visit, so one of these does not stop at
 * their Outro the way a "lost on swap" handoff does (Pact of Neonlight Leap, which keeps plain
 * `lostOnSwap()`): it also covers everything that Outro triggers, the incoming resonator's Intro,
 * and everything *that* triggers — Phrolova's two Unfinished Piece notes, drawn on the incoming
 * Intro, land inside it. Only from the first ordinary press of the next visit is it gone.
 */
import {
  Buff, Cast, applyCurrent, casting, currentMember, currentTeam, frozenStacks, revokeCurrent,
} from "../engine/kit.js";

/** The window, as a two-state count: one stack is the ordinary visit, the second is "the holder
 *  has swapped out and the handoff is closing". Watched from updateGlobal() because the holder is
 *  off field for most of it — their local hooks only run on their own queued follow-ups, which
 *  are the rows to keep, never the row that ends it. */
function handoffWindow(buff: Buff): void {
  // `mine`: is the row being evaluated this holder's own? True on their presses, and true again
  // on a follow-up queued back onto their slot, which run() makes the active slot for it.
  const mine = currentTeam().slot === currentMember();
  // their own Outro opens the closing window; every row before it is an ordinary visit — and the
  // stack gate is what keeps a *teammate's* off-field follow-up mid-visit from ending it early
  if (frozenStacks() < 2) {
    if (mine && casting(Cast.Outro)) applyCurrent(buff, 1);
    return;
  }
  // inside it: the follow-ups that Outro queues back onto the holder's slot, the incoming Intro,
  // and the follow-ups that Intro queues back onto it too (queued from updateGlobal, so they
  // splice in ahead of anything the Intro's own hooks queue). The first row belonging to somebody
  // else is the next visit proper — the handoff is over.
  if (!mine && !casting(Cast.Intro)) revokeCurrent(buff);
}

/** One of those handoffs: a name and whatever it grants, with the window above wired on. */
export function handoff(name: string, applyStats: () => void): Buff {
  const buff: Buff = new Buff({
    name, maxStacks: 2, applyStats,
    // the second stack is bookkeeping, not a doubled payout — no "x2" in the report
    display: () => name,
    updateGlobal: () => handoffWindow(buff),
  });
  return buff;
}
