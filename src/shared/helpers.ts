/**
 * The small kit-authoring shortcuts: things every kit, echo and weapon reaches for that are built
 * out of the engine's own API rather than being part of it. Nothing here holds state or is
 * privileged — each one is an ordinary caller of `kit.js`, kept in one place so a kit file
 * imports its conveniences from a single module instead of three.
 *
 * - `lostOnSwap()` — the "lost on switching out" clause, spelled out once.
 * - `handoff()` — the 15s Outro→Intro handoffs that outlast the receiver's own visit.
 * - `coordinatedBuff()` — a Coordinated-Attack window as a per-action countdown of summons.
 * - `matrix()` — a Matrix piece, with its total-DMG figure rebased onto Matrix Mode's own +20%.
 */
import {
  Action, Buff, Cast, Matrix, Resonator, addStat, applyCurrent, casting, currentAction, currentGear,
  currentMember, currentTeam, frozenStacks, queue, queueOn, removeStack, removeStackEnemy,
  removeStackTeam, revokeCurrent, triggeredAction,
} from "../engine/kit.js";
import type { GearDef } from "../engine/kit.js";
import { Stat } from "../engine/stats.js";

/* -------------------------------------------------------------------------------- lost on swap */

/** Shortcut for a buff whose own kit text says "lost on swap" — revokes itself the moment the
 *  action being evaluated is inactive (the project's own standing convention: lost on swap =
 *  lost on inactive action). Call it from `updateBuffs()` if it should stop contributing before that
 *  same action's own stats apply, or from `convertStats()` if it should still pay out on it first —
 *  same choice as any other revoke, just this one condition spelled out once instead of copied at
 *  every call site. Only correct for a buff whose own holder has no *other* inactive action of
 *  their own (a queued coordinated-attack hit, say) that should leave it standing — one held by a
 *  resonator like that still needs its own explicit condition instead. */
export function lostOnSwap(): void {
  if (!currentAction().active) revokeCurrent(currentGear() as Buff);
}

/* ------------------------------------------------------------------------------------ handoffs */

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

/* ------------------------------------------------------------------------- coordinated windows */

/**
 * A Coordinated-Attack window as the countdown it is: whatever opens it (a Liberation, a mark on
 * the target, an echo press) banks `stacks`, and every active, non-triggered action anyone takes
 * summons one `tick` — always on the slot the window belongs to, however far the field has moved
 * on — and spends one stack. Empty is gone, and the next grant banks the window afresh. The kits'
 * own "damage dealt by the summon does not trigger this" comes free: a tick's hit is queued and
 * so triggered, and can never summon another (nor drain a teammate's window — the gate is shared).
 *
 * Three places the window can live:
 * - team-held (the default — Zhezhi's Inklit Spirits, Cantarella's Diffusion): granted with
 *   `applyTeam`, ticks onto `owner`'s slot. `owner` is a thunk purely for declaration order —
 *   these sit in a kit's buffs section, above the Resonator const they name.
 * - `enemy: true` — really a mark on the target (Verina's Photosynthesis Mark, Yinlin's
 *   Punishment Mark, their stacks the mark's own seconds): granted with `applyEnemy`, it runs out
 *   whether or not it was drawn dry.
 * - `owner: null` — held by the wearer themselves (Jué's Blessing of Time, granted with
 *   `applyCurrent` by an echo any build can carry, so there is no resonator to name): watched
 *   from updateGlobal(), which still sees every action but keeps the "current" pointers on the
 *   holder, so a plain queue()/removeStack() lands the ticks and the countdown on them.
 *
 * `applyStats` rides along for a window that is also a buff while it stands — held means a stack
 * remains, so it needs no gate of its own (Blessing of Time's own +16% Resonance Skill DMG).
 *
 * `hits` is how many rows one summon fires (still one stack) — for a summon whose single volley
 * is several real hits (Rebecca's turret, 5 shots), fired individually so the detail table's
 * field grouping counts them right.
 *
 * `every` spends a stack per qualifying action as usual but only summons on each nth of them —
 * for a field whose own clock is slower than the window it stands for (Denia's Erosion Field, one
 * tick per five presses across thirty-five).
 *
 * A Resonance Liberation never counts: it is a cast of its own rather than the steady stream of
 * presses these windows are counting off, so it neither summons nor spends.
 */
export function coordinatedBuff(name: string, stacks: number, owner: (() => Resonator) | null, tick: Action, { enemy = false, hits = 1, every = 1, applyStats }: { enemy?: boolean; hits?: number; every?: number; applyStats?: () => void } = {}): Buff {
  const fire = (): void => {
    if (!currentAction().active || triggeredAction() || casting(Cast.Liberation)) return;
    // `frozenStacks()` is what stood before this action, so the nth press is the one that leaves a
    // multiple of `every` behind it
    const summons = (frozenStacks() - 1) % every === 0 ? hits : 0;
    if (owner === null) { for (let k = 0; k < summons; k++) queue(tick); removeStack(buff, 1); }
    else { for (let k = 0; k < summons; k++) queueOn(owner(), tick); (enemy ? removeStackEnemy : removeStackTeam)(buff, 1); }
  };
  const buff: Buff = new Buff({
    name, maxStacks: stacks, applyStats,
    // the window *is* the field standing, so granting it is what the report files the summons
    // under — named off the tick's own declaration rather than asked for twice
    field: tick.field,
    // the count reads as the seconds the field has left, one qualifying press to the second —
    // `every` spaces the summons out, it doesn't shorten the stand — so Jué's fresh window says
    // (15s) and Rebecca's turret (14s), not a bare count that means nothing beside them
    display: () => `${name} (${frozenStacks()}s)`,
    ...(owner === null ? { updateGlobal: fire } : { updateBuffs: fire }),
  });
  return buff;
}

/* ------------------------------------------------------------------------------------ matrices */

/**
 * Matrices — one optional piece per kit, worn only in Matrix Mode (the comparison table's own
 * box; see kit.ts's `Loadout.matrix`). Matrix Mode itself already hands every resonator a flat
 * +20% total DMG, so a Matrix's own "deal 25% more total DMG" is worth (1.20 + 0.25) / 1.20 over
 * that baseline, not a full 1.25x — which is `pct / 1.2` as an additive Total Damage stat: 20.83%
 * for a 25% Matrix, 16.67% for a 20% one. Teams without a single Matrix are left exactly as they
 * were, since the baseline cancels out of every comparison.
 */

/** `<resonator>: Matrix` — `totalDmg` is the listed "deal N% more total DMG", rebased onto Matrix
 *  Mode's own +20%. Anything else the Matrix does (a Liberation-triggered team buff) goes in `def`.
 *  0 is for a Matrix carrying no total-DMG line at all (Lucy's Function Cracking, which is only its
 *  own effect): worth (1.20 + 0) / 1.20 over the baseline, i.e. nothing, and contributed as nothing
 *  rather than as a 0 the report would carry a row for. */
export const matrix = (resonator: string, totalDmg: number, def: Omit<GearDef, "name" | "constantStats"> = {}): Matrix =>
  new Matrix({
    name: `${resonator}: Matrix`,
    constantStats: () => { if (totalDmg) addStat(Stat.TotalDmg, totalDmg / 1.2); },
    ...def,
  });
