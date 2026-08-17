/**
 * Off-tune break, as an ordinary buff and action rather than a special case in the engine:
 *   AUTO_TUNE_BREAK   a buff that watches the bar and queues the cast
 *   TUNE_BREAK_CAST   the cast, which empties the bar
 */
import { Action, Buff, PRIORITY } from "../kit.js";
import type { ResolvedSnapshot } from "../state.js";
import { Resource, Element, DamageType, Cast, Scaling } from "../stats.js";

/** The bar resets to -30000, not 0: about three seconds of dead window before it can build
 *  again. */
const OFFTUNE_AFTER_BREAK = -30000;

/** What a tune break's own row renders in — actions don't carry their own colour any more (see
 *  kit.js), so the web view (index.ts) reads this directly and gives an echo cast the same
 *  treatment: neither belongs to any one kit, so both read the same neutral white rather than
 *  whoever happened to be acting. */
export const TUNE_BREAK_COLOR = "#ffffff";

/** Off-tune break. Scales off the tune constant, bypasses crit. Empties the bar itself, so the
 *  drop lands on this row's own off-tune trace rather than whatever action filled it. */
export const TUNE_BREAK_CAST = new Action("Tune Break", {
  element: Element.Physical,
  scaling: Scaling.Tune,
  cast: Cast.TuneBreak,
  type: DamageType.Break,
  mv: 1600,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.setTeamCounter(Resource.Offtune, OFFTUNE_AFTER_BREAK); },
});

/** The watcher — seed it onto a State and the bar takes care of itself. AUTO_ACTION so it reads
 *  the bar after everything that could have added to it this action. Only queues; the cast
 *  itself empties the bar, so the filling action still reports the full bar it earned. */
export const AUTO_TUNE_BREAK = new Buff(PRIORITY.AUTO_ACTION, (ctx) => {
  const a = ctx.action!;
  const max = ctx.enemy.maxOfftune;
  if (max && a.active && a !== TUNE_BREAK_CAST && ctx.teamCounter(Resource.Offtune) >= max) {
    ctx.queue(TUNE_BREAK_CAST);
  }
  return "Auto Tune Break";
});

/** Who a tune break's row is attributed to for the totals-by-slot table (grouping only, never
 *  numbers) — it fires on whoever is active, but it's the team's shared bar going off, not
 *  their cast, so it gets its own bucket instead of inflating one character's own total. */
export const MISC = "Misc";

/** Call once after a rotation is run, before the snapshot reaches anything that groups by
 *  `.slot`. Only `.slot` (the totals bucket) is relabeled to "Misc" — `.member` (the per-row
 *  "who acted" column) is left alone, so a tune break still shows its real actor there even
 *  though the row itself renders in the neutral white every tune break/echo cast shares (see
 *  `TUNE_BREAK_COLOR`). Returns the same snapshot for easy chaining into a `.map()`. */
export const attributeMisc = (snap: ResolvedSnapshot): ResolvedSnapshot => {
  if (snap.action === TUNE_BREAK_CAST) snap.slot = MISC;
  return snap;
};
