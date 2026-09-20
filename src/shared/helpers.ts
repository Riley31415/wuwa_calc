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
import { Cast } from "../engine/stats.js";
import { Action } from "../engine/rotation.js";
import { Buff, Matrix, Resonator } from "../engine/gear.js";
import {
  addStat,
  applyCurrent,
  casting,
  currentAction,
  currentGear,
  currentMember,
  currentTeam,
  isActive,
  queue,
  queueOn,
  revokeCurrent,
  frozenStacks,
} from "../engine/context.js";
import type { GearDef } from "../engine/gear.js";
import { Stat } from "../engine/stats.js";

/* -------------------------------------------------------------------------------- lost on swap */

/** Shortcut for a buff whose own kit text says "lost on swap" — revokes itself on the action that
 *  takes its holder off the field (`ActionDef.swapOut`: an Outro, a swap marker, an echo's swap
 *  form). Call it from `updateBuffs()` if it should stop contributing before that same action's own
 *  stats apply, or from `convertStats()` if it should still pay out on it first — same choice as any
 *  other revoke, just this one condition spelled out once instead of copied at every call site. */
export function lostOnSwap(): void {
  if (currentAction().swapOut) revokeCurrent(currentGear() as Buff);
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

/** One of those handoffs: a name and whatever it grants, with the window above wired on. The
 *  seconds are the text's own ("for 15s", every one of them so far); the window still closes it
 *  at the next visit's first press where that comes sooner. */
export function handoff(name: string, applyStats: () => void, seconds = 15): Buff {
  const buff: Buff = new Buff({
    name, maxStacks: 2, applyStats, duration: 60 * seconds,
    // the second stack is bookkeeping, not a doubled payout — no "x2" in the report
    display: () => name,
    updateGlobal: () => handoffWindow(buff),
  });
  return buff;
}

/* ------------------------------------------------------------------------- coordinated windows */

/**
 * A Coordinated-Attack window as the clock it is: whatever opens it (a Liberation, a mark on the
 * target, an echo press) banks `seconds` as its stacks — which is how long it stands, so the same
 * window can be granted at either of two lengths (Zhezhi's 21 or 27 spirits) — and every `every`
 * seconds of the fight clock it summons one `tick`, always on the slot the window belongs to,
 * however far the field has moved on, until it runs out. A grant on a standing window refreshes
 * it; the cadence runs on from where it was. The kits' own "damage dealt by the summon does not
 * trigger this" comes free: a summon is a queued follow-up, and the clock reads only the frames
 * a press takes.
 *
 * Three places the window can live:
 * - team-held (the default — Zhezhi's Inklit Spirits, Cantarella's Diffusion): granted with
 *   `applyTeam`, ticks onto `owner`'s slot. `owner` is a thunk purely for declaration order —
 *   these sit in a kit's buffs section, above the Resonator const they name.
 * - on the target (Verina's Photosynthesis Mark, Yinlin's Punishment Mark): granted with
 *   `applyEnemy`, nothing else about it differs.
 * - `owner: null` — held by the wearer themselves (Jué's Blessing of Time, granted with
 *   `applyCurrent` by an echo any build can carry, so there is no resonator to name): the ticks
 *   fire with the "current" pointers on the holder, so a plain queue() lands them on them.
 *
 * `applyStats` rides along for a window that is also a buff while it stands — held means it has
 * time left, so it needs no gate of its own (Blessing of Time's own +16% Resonance Skill DMG).
 *
 * `hits` is how many rows one summon fires — for a summon whose single volley is several real
 * hits (Rebecca's turret, 5 shots), fired individually so the detail table's field grouping
 * counts them right.
 *
 * `every` is the summon's own cadence in seconds, fractional where it is (Ciaccona's Tonics, one
 * per 1.65s across thirty-three; Suoming's crests at 4/3s). `onTick` runs after each summon with
 * its ordinal, for a node that counts them (Zhezhi's S5, every third spirit).
 */
export function coordinatedBuff(name: string, seconds: number, owner: (() => Resonator) | null, tick: Action, { hits = 1, every = 1, applyStats, onTick }: { hits?: number; every?: number; applyStats?: () => void; onTick?: (n: number) => void } = {}): Buff {
  return new Buff({
    name, maxStacks: seconds, applyStats,
    // the window *is* the field standing, so granting it is what the report files the summons
    // under — named off the tick's own declaration rather than asked for twice
    field: tick.field,
    // its stacks are its length, not a count worth an "xN": the engine's own "(Ns)" says what is left
    display: () => name,
    duration: (n) => 60 * n,
    tick: {
      every: Math.round(60 * every),
      fire: (n) => {
        for (let k = 0; k < hits; k++) {
          if (owner === null) queue(tick);
          else queueOn(owner(), tick);
        }
        onTick?.(n);
      },
    },
  });
}

/* ------------------------------------------------------------------------------------ matrices */

/**
 * Matrices — one optional piece per kit, worn only in Matrix Mode (the comparison table's own
 * box; see gear.ts's `Loadout.matrix`). Matrix Mode itself already hands every resonator a flat
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
    name: `${resonator}: Matrix Buff`,
    constantStats: () => { if (totalDmg) addStat(Stat.TotalDmg, totalDmg / 1.2); },
    ...def,
  });
