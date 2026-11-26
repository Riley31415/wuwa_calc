/**
 * Rotations, and the scheduler that decides whose turn it is.
 *
 * A resonator's rotation is not a flat list of casts — it's up to three *action chains*, one per
 * way of arriving on field, and a kit writes all three as a single array that `Rotation`'s
 * constructor splits apart:
 *
 *   new Rotation([
 *     START_LAST, Skill.swap(),                             // the fight's own first seconds
 *     SWAPIN, BA1, BA2, GeopotentialShift,                  // leading the team, with no Intro to cast
 *     Intro, Liberation, WBA1, WBA2, HERON.instaSwap(), Outro, // every visit after
 *   ])
 *
 * An Intro chain opens on the kit's own Intro, or on every Intro it may open on written back to
 * back (`Intro, EIntro, ...`), and any Intro written further in is another place it starts: the
 * arrival starts on the Intro their `intro` picks, passing every other one it reaches by, and one
 * with no chain listing it throws. A rotation can give each Intro a chain of its own or share one.
 * `.firstIntro()`, `.inFirstSlot()`, `.inLastSlot()` and `.doubleIntro()` on an Intro open the
 * first arrival's chain, a team position's, or a double-Intro pre-visit instead (`IntroEntry`).
 *
 * The SWAPIN chain runs *through* the Intro without casting it and carries on into the same
 * tail, so the body a resonator repeats is written once — the opener is that body plus whatever
 * prefix it declares, minus the Intro nobody could have handed them at the start of a fight. Give
 * the opener its own Outro before the Intro instead and the two stop sharing, for a kit whose
 * opener genuinely isn't its loop. A SWAPIN chain that runs into a `.doubleIntro()` pre-visit
 * shares *that* instead: leading, the opener is the prefix and then the pre-visit's casts and outro.
 *
 * Markers are `Action`s so a kit can keep writing one plain array, but none of them is a cast:
 * an Intro entry and every mainslot echo's cast (echoes/echo.ts) stand for one and resolve through
 * `Action.resolve` at run time, and the rest are read by the compiler here and never reach `evaluate()`. A resonator
 * leaves the field on its Outro, on a cast's swap form (`.swapCancel()`, `.instaSwap()`), which the
 * scheduler follows with SWAP unless an Outro comes next, or on a SWAP written after a press played out.
 */
import { Gear, NO_CAPS, DEFAULT_PRESSES } from "./gear.js";
import { run } from "./evaluate.js";
import { currentMember, currentTeam, isCast, grounded, midair, concerto, forte1, forte2, forte3, forte4, forte5, after, notAfter, holds, lacks } from "./context.js";
import { ctx, resolving } from "./runtime.js";
import type { GearDef, Mainslot } from "./gear.js";
import type { State, TeamMember, VisitGate } from "./state.js";
import type { Result } from "./evaluate.js";
import { Cast, Input, INPUTS, isHeldInput, Transition, Timing, KIND_OF, VIA_OF, Via, isSwapTransition, waitsForNext, instaOf, INPUT_PRECISION, MASH_SPEED, HOLD_BUFFER, DESPAWN_TIME, Position, splitStop, DELAYS, delaysWith, useDelays, atDelays } from "./stats.js";
import { INPUT_NAME } from "./stats.js";
import type { Delays } from "./stats.js";
import type { Attribute, Type, Subtype, Node, Scaling } from "./stats.js";

/** Each button's held input (`Action.held()`). */
const HELD_OF: Partial<Record<Input, Input>> = { [Input.Basic]: Input.BasicHold, [Input.Skill]: Input.SkillHold, [Input.Liberation]: Input.LiberationHold };

/* ------------------------------------------------------------------------------- the action */

export interface ActionDef extends GearDef {
  /** What every hit that names none of its own deals as — the action itself has no tags. */
  element?: Attribute | null;
  type?: Type | null;
  subtype?: Subtype | null;
  /** Unset, `Cast.None`: nobody's cast (a coordinated hit, a queued follow-up, a wait). */
  cast?: Cast;
  subcast?: Cast;
  node?: Node | null;
  scaling?: Scaling | null;
  /** What the *cast* banks, the moment it is pressed: a spend (an outro's -100 Concerto, a forte
   *  drain), and the flat regen a kit grants on the press rather than on a landed hit. A hit's own
   *  gains are its bullet's, so a press whose hit lands later (an outro, an insta swap, a summon)
   *  or never (an insta cut) still pays its cast share then. evaluate() banks both. A cast runs no
   *  stat, so its energy is flat: neither ER nor the Hit Energy Multiplier scales it, and none of it
   *  is shared. */
  castEnergy?: number;
  castConcerto?: number;
  /** Off-tune the cast moves the bar by, unscaled by Off-Tune Buildup Rate like direct off-tune.
   *  Only the Tune Break's drain uses it (evaluate.ts). */
  castOfftune?: number;
  castForte1?: number;
  castForte2?: number;
  castForte3?: number;
  castForte4?: number;
  castForte5?: number;
  /** The report bucket this action's damage groups under, when it isn't the acting resonator's
   *  own — the shared Tune Break, which is nobody's turn (`State.enemy`'s name). Defaults to whoever
   *  cast it. */
  slot?: string;
  /** This cast empties the gauge — a Liberation that spends the whole bar, a form switch that
   *  clears it — whatever it held, without the kit having to declare the cap as a negative delta
   *  and clamp to it first. The gauge is set to 0 *ahead of* this cast's own `castForteN` (and any
   *  `addGain()` its hooks make), so a bare reset lands on 0 and a reset declaring `castForte1: 200`
   *  lands on 200 (Suoming's Flash Rift: clear all Delusion, then the 200 it grants). */
  resetForte1?: boolean;
  resetForte2?: boolean;
  resetForte3?: boolean;
  resetForte4?: boolean;
  resetForte5?: boolean;
  /** What leads to it, one input: what a search walks and a marker picks by. Unset, `Input.None` (nobody's
   *  press); an echo's press is `Input.Echo`. On a second input it is a copy (`swapIn()`, `held()`, `onInput()`). */
  input?: Input;
  /** Its conditions, all of which must hold to press it (`Action.validFn` joins them with AND): it follows one
   *  of `after` and none of `notAfter` (`after()`/`notAfter()`), stands at `position`, every one of `holds` and
   *  none of `lacks` is up (`holds()`/`lacks()`; a sequence or a resonator is held gear too), its bars and the
   *  target's off-tune are inside their `min`/`max` (inclusive). Never energy, never a function: a state kept in
   *  bits or a count is a hidden marker buff the kit keeps in sync. False reads red and warns,
   *  and a hold waits for true. A variant setting any of them replaces every one of its base's. A press another
   *  replaces on its input ("Resonance Skill is replaced with...") is outranked by `inputPriority`, not negated. */
  after?: ActionList;
  notAfter?: ActionList;
  position?: Position;
  holds?: GearList;
  lacks?: GearList;
  minConcerto?: number;
  maxConcerto?: number;
  minForte1?: number;
  maxForte1?: number;
  minForte2?: number;
  maxForte2?: number;
  minForte3?: number;
  maxForte3?: number;
  minForte4?: number;
  maxForte4?: number;
  minForte5?: number;
  maxForte5?: number;
  /** The target's off-tune bar at least this (inclusive): a Tune Break's full bar. */
  minOfftune?: number;
  /** Which press its input makes when several are valid: the highest whose conditions hold with a charge
   *  ready, so a lower one outranked there is invalid. Default 0; the plain dashes, jump, Swap and the
   *  weapon's Tune Break are -1. Not read where chain, stand or buffs read as met, nor on a swap-in opener. */
  inputPriority?: number;
  /** It doesn't break its owner's chain: the next press follows the one before it (`chainAs()`) — a summon echo. */
  keepsChain?: boolean;
  /** Cast at the start of the press after it, never cutting the one before (a summon echo): that
   *  press's cut, hold or mash is made by the press past it, and weighed against that one. */
  castsWithNext?: boolean;
  /** Where it leaves its owner; unset, where they stood. */
  endPosition?: Position;
  /** A rotation marker rather than a real cast: `run()` calls this to get whichever action to
   *  actually evaluate in its place, with the "current" pointers already aimed at the acting slot
   *  (so it can read `currentMember()` etc. the same as any other kit logic). Every marker below
   *  that stands for a real cast — INTRO, a mainslot echo's cast — is built on this, which
   *  is why the engine knows nothing about any of them by name. `null` means the marker resolved
   *  to no cast at all this step (it deferred itself onto a later one, say — see `queueOnIntro()`),
   *  and `run()` simply moves on. */
  resolve?: () => Action | null;
  /** The mainslot echo this cast belongs to: it plays only while its wearer has that equipped, and
   *  is skipped otherwise (echoes/echo.ts), so a rotation writes one per mainslot its loadouts allow. */
  mainslot?: Mainslot;
  /** How long this press's animation runs, in frames at 60 per second — `total_frames`, its
   *  `timestop` included. The fight clock (`State.frame`) advances by this less the time stop
   *  (`cancelCost()`, context.ts's `elapsed()`), and every buff duration and tick clock is measured
   *  against that. 0, the default, is a press that takes no time of the fight's own: a follow-up,
   *  a summon echo. One nothing has measured declares 60, the engine's one-second stand-in. */
  animFrames?: number;
  /** The press's priority over its animation past its `castPriority`, frame -> tier (wuwalab's
   *  `priority_timeline` less its opening `[0, castPriority]`): it holds its cast priority until
   *  its first window, so `{ 10: 2 }` on a cast-5 press holds 5 until frame 10, then 2. Another
   *  press cuts it only where that press's `castPriority` is higher; a swap is gated by
   *  `noSwapFrames` instead. */
  animPriority?: Readonly<Record<number, number>>;
  /** The tier this press cuts in at (wuwalab's `skill_priority`), against the `animPriority` of
   *  the press it cuts. Unset, nothing checks it — nor does anything for an OFF_FIELD hit or an Outro. */
  castPriority?: number;
  /** The frames the resonator can't swap out for (wuwalab's `no_swap`): a swap form, or a cut
   *  into an Outro, inside them throws; a mash swap and a mash cancel into an Outro wait them out. */
  noSwapFrames?: number;
  /** The frames only a Dodge-input press can cut it (a transform echo's whole animation): any other waits
   *  them out on a mash or hold cancel, and a plain cut inside them throws; a swap or an Outro is free. */
  transformFrames?: number;
  /** An Intro's frame the Outro buffs queued for it land on, their durations starting there. */
  qteFrames?: number;
  /** The press's bullets, each landing on its own frame (wuwalab's `hits`), each with what it deals
   *  and banks. Unset, a press with a motion value is one bullet at `animFrames`; empty, a cast alone. */
  bullets?: BulletDef[];
  /** The animation frames the world stands still for, `[start, end)` (wuwalab's `time_stop_start`
   *  and `time_stop`) — part of the animation, but none of the fight's time: `cancelCost()` takes it back off. */
  timestop?: readonly [number, number];
  /** The animation frames the hit freezes for, `[start, end)` (wuwalab's `motion_stop`): every
   *  inactive resonator's queued hits and clocks pause through it (`shiftOffField()`). */
  motionStop?: readonly [number, number];
  /** The field this hit belongs to — a summon firing on its own beside the fight (a coordinated
   *  attack, Denia's Erosion Field, Jué's follow-up, Xiangli Yao's outro laser, Rebecca's turret).
   *  The same `ActionField` the Buff that opens the field names, which is what pairs a run of hits
   *  with the cast that created them (see `ActionField` below). A one-off reuse of a field's own
   *  hit outside it (Mortefi's S5 burst, Verina's S6 proc) leaves it off, or clears it with `null`
   *  on a variant of a hit that has one. */
  field?: ActionField | null;
  /** What pressing this draws on: a count of frames for a cooldown of its own, or a `Cooldown`
   *  shared with the casts that share it (Jinhsi's two skills, Buling's two Liberations). A
   *  rotation entry with no charge left waits it out first (`Cooldown.wait()`); an Intro's holds
   *  the handoff into it instead, like any gated press of the visit it opens. */
  cooldown?: number | Cooldown;
  /** The length this cast puts a shared `cooldown` on, where the casts sharing it differ (Jinhsi's
   *  Trailing Lights 3s, Crescent Divinity 10s). The Cooldown's own `frames` otherwise. */
  cooldownFrames?: number;
  /** How this action hands over to the next (an old written cancel): `Temporary` unless it says otherwise. */
  transition?: Transition;
  /** A press with no input that still plays on field: its owner's own animation carrying on (Brant's flips). */
  onField?: boolean;
  /** A wait on the game timer (`Cooldown.wait()`): `animFrames` are game frames, and it plays
   *  however many real ones that takes, time stop landing inside it included. */
  gameWait?: boolean;
}

export { Transition, Timing };

/** One bullet of a press: the frame it hits from the press's start (time stop included), the frame
 *  it commits by (a cut after that can't stop it), what it deals and banks, what it deals as (the
 *  def's own element/type/subtype where it names none), and its hooks. */
export interface BulletDef {
  hitFrame: number;
  /** Defaults to `hitFrame`. */
  commitFrame?: number;
  mv?: number;
  energy?: number;
  concerto?: number;
  offtune?: number;
  forte1?: number;
  forte2?: number;
  forte3?: number;
  forte4?: number;
  forte5?: number;
  element?: Attribute | null;
  type?: Type | null;
  subtype?: Subtype | null;
  /** What this bullet alone inflicts as it lands, beside the action's own `updateDebuffs` (which
   *  runs on every bullet): an infliction the press makes once goes on the bullet that makes it. */
  updateDebuffs?: () => void;
  /** This bullet's own `hitGlobal`, beside the action's (every bullet). */
  hitGlobal?: () => void;
}
/** A bullet as the action holds it — what `currentHit()` hands a hit hook: its commit, every tag
 *  and gain resolved, and which of its press's bullets it is. Frozen: a hook reads it, never writes. */
export interface Bullet extends Readonly<BulletDef> {
  readonly commitFrame: number;
  readonly mv: number;
  readonly energy: number;
  readonly concerto: number;
  readonly offtune: number;
  readonly forte1: number;
  readonly forte2: number;
  readonly forte3: number;
  readonly forte4: number;
  readonly forte5: number;
  readonly element: Attribute | null;
  readonly type: Type | null;
  readonly subtype: Subtype | null;
  readonly index: number;
}

/** A press's frames as the clock charges them, by its transition: `action` the frames to the frame its
 *  cut aims at, `global` the input delay after it; the next press starts at their sum. */
export function cancelCost(a: Action, cut: Transition | null): { action: number; timestop: number; global: number; total: number } {
  const full = a.animFrames;
  const kind = cut ?? a.transition, t = KIND_OF[kind];
  // the whole press's frames, a cast part holding none of its bullets
  const whole = a.half === "cast" ? a.formOf ?? a : a;
  let aim: number, delay = 0;
  // an Outro is cast on the way off, and plays its animation behind the incoming Intro
  if (a.offField || a.cast === Cast.Outro) aim = 0;
  else if (t === "instant") [aim, delay] = [0, INPUT_PRECISION];
  else if (t === "lastcommit") [aim, delay] = [whole.cutFrame, INPUT_PRECISION];
  else if (t === "onhit") [aim, delay] = [whole.onHitAt ?? whole.cutFrame, INPUT_PRECISION];
  else if (t === "timed") aim = whole.timedAt ?? a.timedAt ?? full;
  else if (kind === Transition.MashSwap) [aim, delay] = [Math.max(whole.noSwapFrames, INPUT_PRECISION), MASH_SPEED];
  // a hold or mash lets go where the next press can come out (`holdAt()`), here at its least
  else if (t === "hold") aim = INPUT_PRECISION + HOLD_BUFFER;
  else if (t === "mash") [aim, delay] = [INPUT_PRECISION, MASH_SPEED];
  else aim = full;
  // never past its end: what the cut runs on past it is delay with nothing playing
  const action = Math.min(aim, full), global = aim - action + delay;
  const timestop = splitStop(a.timestopFrom, a.timestop, action, action + global).own;
  return { action, timestop, global, total: action - timestop + global };
}

/** A bar after `delta` banks on it, the way evaluate() banks every one — energy, concerto, forte,
 *  off-tune alike. It fills past `cap` freely; a spend starts from the cap rather than the overrun
 *  (0 is no cap); a bar left below empty is short, and the next gain starts it from 0. */
export const bank = (bar: number, delta: number, cap: number): number =>
  (delta > 0 && bar < 0 ? 0 : delta < 0 && cap > 0 && bar > cap ? cap : bar) + delta;

/** `bank()` for bar `k` of a press (0 energy, 1 concerto, 2-6 forte), a forte gauge's `resetForteN`
 *  emptying it first. `cap` is the member's own, bar by bar (`Resonator.caps`). */
export const bankBar = (k: number, g: number, delta: number, reset: boolean, cap: readonly number[]): number =>
  bank(reset ? 0 : g, delta, cap[k]!);

export interface CooldownDef {
  /** Frames one charge takes to come back — a function where a sequence shortens it, read when
   *  that charge's recharge starts. */
  frames: number | (() => number);
  /** Charges held at most, and at the start of the fight — a function where a sequence adds one. */
  charges?: number | (() => number);
}

/** A row of nothing but `frames` of waiting, named for what it waits on. */
export const waitFor = (frames: number, what: string, gameWait = false): Action =>
  new Action(`Wait ${(frames / 60).toFixed(2)}s for ${what}`, { animFrames: frames, gameWait });
ctx.waitFor = waitFor;

/** A cooldown one or more casts draw on, tracked per member (`TeamMember.cooldownAt()`): each
 *  press spends a charge, and a spent charge comes back `frames` later, one at a time, while the
 *  count is below `charges`. */
export class Cooldown {
  readonly frames: () => number;
  readonly charges: () => number;
  constructor(def: CooldownDef) {
    const { frames, charges = 1 } = def;
    this.frames = typeof frames === "function" ? frames : () => frames;
    this.charges = typeof charges === "function" ? charges : () => charges;
  }
  /** The row a press on this stands behind while no charge is left: nothing but the frames, named
   *  for the press it waits on. */
  wait(frames: number, forPress: string): Action {
    const key = `${frames}|${forPress}`;
    let out = this.waits.get(key);
    if (!out) this.waits.set(key, (out = waitFor(frames, `${forPress}'s cooldown`, true)));
    return out;
  }
  /** One wait row per length and press, so its parts are made once. */
  private readonly waits = new Map<string, Action>();
}

/** What a hold whose next press needs nothing, or has it on the cast, is paid at. */
const PAID_AT_ONCE: { at: number; ready: boolean } = Object.freeze({ at: 0, ready: true });

/** Condition fields that are gone, refused wherever a def still carries one. */
const GONE_CONDITIONS = ["requireBuff", "forbidBuff", "castPosition", "heldInput", "minEnergy", "maxEnergy", "yieldsTo", "valid"];
/** Every `ActionDef` key that is a condition: what a variant setting any of them drops from its base. */
const CONDITIONS = ["after", "notAfter", "position", "holds", "lacks", "minConcerto", "maxConcerto", "minForte1", "maxForte1",
  "minForte2", "maxForte2", "minForte3", "maxForte3", "minForte4", "maxForte4", "minForte5", "maxForte5", "minOfftune"] as const;
/** Presses a condition names: declared above it, or set late where they loop (`Action.setAfter()`). */
export type ActionList = readonly Action[];
/** Gear a condition names: one or several. */
export type GearList = Gear | readonly Gear[];
const listOf = <T>(l: T | readonly T[]): (() => readonly T[]) =>
  Array.isArray(l) ? () => l as readonly T[] : () => [l as T];
const BARS = [["Concerto", concerto], ["Forte1", forte1], ["Forte2", forte2], ["Forte3", forte3], ["Forte4", forte4], ["Forte5", forte5]] as const;
/** `def`'s conditions as one handler, null where it has none: chain, stand, buffs, bars, off-tune. */
function buildValid(def: ActionDef): (() => boolean) | null {
  const terms: (() => boolean)[] = [];
  if (def.after) {
    const l = listOf(def.after);
    terms.push(() => after(...l()));
  }
  if (def.notAfter) {
    const l = listOf(def.notAfter);
    terms.push(() => notAfter(...l()));
  }
  if (def.position !== undefined) terms.push(def.position === Position.Grounded ? grounded : midair);
  if (def.holds) {
    const l = listOf(def.holds);
    terms.push(() => holds(...l()));
  }
  if (def.lacks) {
    const l = listOf(def.lacks);
    terms.push(() => lacks(...l()));
  }
  for (const [bar, read] of BARS) {
    const lo = (def as Record<string, unknown>)[`min${bar}`] as number | undefined, hi = (def as Record<string, unknown>)[`max${bar}`] as number | undefined;
    if (lo !== undefined) terms.push(() => read() >= lo);
    if (hi !== undefined) terms.push(() => read() <= hi);
  }
  if (def.minOfftune !== undefined) {
    const lo = def.minOfftune;
    terms.push(() => currentTeam().offtune >= lo);
  }
  if (!terms.length) return null;
  if (terms.length === 1) return terms[0]!;
  return () => {
    for (const t of terms) if (!t()) return false;
    return true;
  };
}

/** A cast. Mostly data — element/type/cast tags, its motion value, and the energy/concerto/
 *  off-tune/forte it banks — but a Gear like any other, so anything an action *does* can live
 *  directly on it: `evaluate()` runs the acting action's own hooks first in every phase, with the
 *  "current" pointers aimed at it, so what it grants is attributed to it and every stat it
 *  contributes is sourced to its own name. Prefer that to a held Gear branching on
 *  `runningAction(X)`; a `casting(Y)`/`isType(Y)` check that spans a whole *category* of
 *  actions still belongs on the Gear.
 *
 *  Lives here rather than in gear.ts so its rotation-flavoured forms — the cuts, `swap()` — sit
 *  beside the markers they belong with. gear.ts refers to it strictly through
 *  `import type`, which is what keeps the two modules from being a load-order cycle. */
export class Action extends Gear {
  cast: Cast;
  subcast: Cast;
  node: Node | null;
  scaling: Scaling | null;
  mv: number;
  /** Which part of a split press this plays — its cast, one hit, or its end (`afterAction` alone) —
   *  each running only its own hooks; null on a whole press, which runs all three. */
  half: "cast" | "hit" | "end" | null = null;
  /** Which of its press's bullets a hit part is; -1 on anything else. */
  hitIndex = -1;
  /** The bullets this press lands (see `ActionDef.bullets`). */
  bullets: readonly Bullet[];
  /** The bullet whose tags a part or a whole press deals as — its last (a part holds one) — or
   *  null on a cast with no bullet, which deals as nothing. */
  get lastBullet(): Bullet | null { return this.bullets[this.bullets.length - 1] ?? null; }
  /** The last bullet that deals something — the one a press's row reads its stats under — else
   *  `lastBullet`. */
  get lastDamage(): Bullet | null {
    for (let k = this.bullets.length - 1; k >= 0; k--) if (this.bullets[k]!.mv > 0) return this.bullets[k]!;
    return this.lastBullet;
  }
  /** What evaluate() banks for this part or press of its own, its cast's and its bullets' together:
   *  energy, concerto, forte 1-5, off-tune — `bars`' order, off-tune last. Engine-owned: a hook reads its cast's
   *  `castX` (`currentCast()`) or its hit's own (`currentHit()`), never this. */
  readonly banks: readonly number[];
  /** What the cast banks of its own: energy, concerto, off-tune, forte 1-5. */
  castEnergy: number;
  castConcerto: number;
  castOfftune: number;
  castForte: readonly number[];
  slot: string | null;
  /** `ActionDef.input` (`Input.None` on a press nobody makes). */
  input: Input;
  /** Its own condition fields joined, null where it has none; `isValid()` adds
   *  whether a press above it on its input takes the input (`outranked()`). */
  validFn: (() => boolean) | null;
  /** `ActionDef.inputPriority`. */
  inputPriority: number;
  /** It has a chain or stand condition: outranked by it, a press misses on its chain (`missesOn()`). */
  chainBound: boolean;
  /** `ActionDef.endPosition`, null where unset, and `keepsChain`. */
  endPosition: Position | null;
  keepsChain: boolean;
  /** `ActionDef.castsWithNext`. */
  castsWithNext: boolean;
  /** A held input (`Input.BasicHold`, `SkillHold`, `LiberationHold`): what a hold cancel holds into,
   *  and what a mash cancel may never go into. */
  heldInput: boolean;
  /** `resetForte1`-`resetForte5` as one array, indexed the way `TeamMember.forte` is. */
  resetForte: [boolean, boolean, boolean, boolean, boolean];
  /** Per bar — energy, concerto, forte 1-5 — what the cast banks of its own and whether it empties
   *  the bar first, and every bullet's gain there, seven a bullet in bullet order. */
  readonly castGains: readonly number[];
  readonly resetBars: readonly boolean[];
  readonly bulletGains: readonly number[];
  /** Per bar, which part moves it (-1 the cast, else a bullet) and by how much, zeroes left out (`bankPress`). */
  readonly gainFrom: readonly (readonly number[])[];
  readonly gainBy: readonly (readonly number[])[];
  resolveFn?: () => Action | null;
  /** `ActionDef.mainslot`, null on every press that is no echo's. */
  mainslot: Mainslot | null;
  animFrames: number;
  /** `ActionDef.animPriority` as [frame, tier] windows, in frame order; empty where it has none. */
  animPriority: readonly (readonly [number, number])[];
  castPriority: number | null;
  noSwapFrames: number;
  transformFrames: number;
  qteFrames: number;
  /** Where an on-hit cut cuts (its first bullet's hit); null on every other press. Engine-owned. */
  onHitAt: number | null = null;
  /** Where a timed cut cuts (`timedCancel()`); null on every other press. Engine-owned. */
  timedAt: number | null = null;
  /** The stops' lengths, and the animation frame each starts on (`ActionDef.timestop`/`motionStop`). */
  timestop: number;
  timestopFrom: number;
  motionStop: number;
  motionStopFrom: number;
  cooldown: Cooldown | null;
  cooldownFrames: number;
  gameWait: boolean;
  /** How this press hands over to the next (`ActionDef.transition`). */
  transition: Transition;
  /** What this was built from, kept so `variant()` can rebuild it with a change or two. */
  readonly def: ActionDef;
  /** The cast this is the dash- or jump-cancelled form of; null on every ordinary one. A cancel is
   *  a fresh Action carrying the original's hooks and cast tags, so a bare `===` against the cast a
   *  kit named would miss it — context.ts's own `runningAction()` is what reads this. Engine-owned:
   *  set by the insta forms below, never by a kit. */
  cancelOf: Action | null = null;
  /** The cast this is a *renamed* form of — a swap-out (`swap()`), a Unison outro. To anything
   *  that ranks casts the two are one press, told apart only by how it ended; `cancelOf` above is
   *  the same link for a cancel. A form that keeps its cast's own name (`paired()`, a kit's
   *  same-named `variant()`) needs none, being already indistinguishable by name. Engine-owned:
   *  never set by a kit. */
  formOf: Action | null = null;
  /** Lazily-filled cache for runtime.ts's `tagWordOf()` — this action's own element/type/subtype, as the
   *  one word every scoped stat contribution tests against. Engine-owned; never set by a kit. */
  _tagWord?: number;

  constructor(name: string, def: ActionDef = {}) {
    super({ ...def, name });
    this.cast = def.cast ?? Cast.None;
    this.subcast = def.subcast ?? Cast.None;
    this.node = def.node ?? null;
    this.scaling = def.scaling ?? null;
    this.animFrames = def.animFrames ?? 0;
    // a kit's def is often typed loosely, so a stale key would be dropped without a word
    if ("prioFrames" in def) throw new Error(`${name}: prioFrames is gone — declare animPriority and castPriority`);
    this.animPriority = Object.entries(def.animPriority ?? {}).map(([f, t]) => [Number(f), t] as const).sort((a, b) => a[0] - b[0]);
    this.castPriority = def.castPriority ?? null;
    this.noSwapFrames = def.noSwapFrames ?? 0;
    this.transformFrames = def.transformFrames ?? 0;
    this.qteFrames = def.qteFrames ?? 0;
    if (def.qteFrames !== undefined && def.cast !== Cast.Intro) throw new Error(`${name}: qteFrames is an Intro's alone`);
    if (def.cast === Cast.Intro && !def.resolve && def.endPosition === undefined) throw new Error(`${name}: every Intro declares its endPosition`);
    // a hit's gains are its bullet's and a cast's its `castX`: the old action-level totals are gone
    for (const k of ["energy", "concerto", "offtune", "forte1", "forte2", "forte3", "forte4", "forte5"]) {
      if (k in def) throw new Error(`${name}: an action has no \`${k}\` of its own — declare it on a bullet, or as \`cast${k[0]!.toUpperCase()}${k.slice(1)}\``);
    }
    const tag = <T>(own: T | null | undefined, shared: T | null | undefined): T | null => (own !== undefined ? own : shared ?? null);
    // a resolved bullet keeps the index it had in its press (a hit part's one, an insta cut's kept);
    // every field written in one order, so every bullet is one shape to the hooks reading them
    this.bullets = (def.bullets ?? []).map((h, i) => Object.freeze({
      hitFrame: h.hitFrame, commitFrame: h.commitFrame ?? h.hitFrame,
      mv: h.mv ?? 0, energy: h.energy ?? 0, concerto: h.concerto ?? 0, offtune: h.offtune ?? 0,
      forte1: h.forte1 ?? 0, forte2: h.forte2 ?? 0, forte3: h.forte3 ?? 0, forte4: h.forte4 ?? 0, forte5: h.forte5 ?? 0,
      element: tag(h.element, def.element), type: tag(h.type, def.type), subtype: tag(h.subtype, def.subtype),
      updateDebuffs: h.updateDebuffs, hitGlobal: h.hitGlobal,
      index: (h as Partial<Bullet>).index ?? i,
    }));
    // an action's motion value is only ever its bullets'
    this.mv = this.bullets.reduce((n, h) => n + h.mv, 0);
    this.cutFrame = this.bullets.reduce((at, h) => Math.max(at, h.commitFrame), 0);
    // No default: an action that deals damage says what it multiplies, so a kit that forgets
    // fails here rather than silently scaling off ATK. Only a rotation marker (INTRO and
    // friends below), which carries no motion value, is allowed to leave it null.
    if (this.mv !== 0 && this.scaling === null) throw new Error(`${name}: an action with a motion value must declare its scaling`);
    this.castEnergy = def.castEnergy ?? 0;
    this.castConcerto = def.castConcerto ?? 0;
    this.castOfftune = def.castOfftune ?? 0;
    this.slot = def.slot ?? null;
    // a def typed loosely would drop a gone condition field unread
    for (const k of GONE_CONDITIONS) if (k in def) throw new Error(`${name}: \`${k}\` is gone — ${k === "yieldsTo" ? "give the press that takes the input a higher `inputPriority`" : k === "valid" ? "write it as condition fields, a state kept in a hidden marker buff" : "write it as condition fields"}`);
    // a def typed loosely may still carry the old list
    if (Array.isArray(def.input)) throw new Error(`${name}: an action has one input — copy it onto another with .swapIn(), .held() or .onInput()`);
    this.input = def.input ?? (def.mainslot ? Input.Echo : Input.None);
    this.validFn = buildValid(def);
    this.inputPriority = def.inputPriority ?? 0;
    this.chainBound = !!def.after || !!def.notAfter || def.position !== undefined;
    this.endPosition = def.endPosition ?? null;
    this.keepsChain = def.keepsChain ?? false;
    this.castsWithNext = def.castsWithNext ?? false;
    this.heldInput = isHeldInput(this.input);
    this.castForte = [def.castForte1 ?? 0, def.castForte2 ?? 0, def.castForte3 ?? 0, def.castForte4 ?? 0, def.castForte5 ?? 0];
    const banks = [this.castEnergy, this.castConcerto, ...this.castForte, this.castOfftune];
    for (const h of this.bullets) {
      const own = [h.energy, h.concerto, h.forte1, h.forte2, h.forte3, h.forte4, h.forte5, h.offtune];
      for (let k = 0; k < banks.length; k++) banks[k] = banks[k]! + own[k]!;
    }
    this.banks = banks;
    this.resetForte = [!!def.resetForte1, !!def.resetForte2, !!def.resetForte3, !!def.resetForte4, !!def.resetForte5];
    this.castGains = [this.castEnergy, this.castConcerto, ...this.castForte];
    this.resetBars = [false, false, ...this.resetForte];
    this.bulletGains = this.bullets.flatMap((h) => [h.energy, h.concerto, h.forte1, h.forte2, h.forte3, h.forte4, h.forte5]);
    // per bar, the gains that move it — the cast's (-1) then each bullet's — zero ones left out
    const gainFrom: number[][] = [], gainBy: number[][] = [];
    this.gainFrom = gainFrom;
    this.gainBy = gainBy;
    for (let k = 0; k < 7; k++) {
      const from: number[] = [], by: number[] = [];
      if (this.castGains[k]) {
        from.push(-1);
        by.push(this.castGains[k]!);
      }
      for (let j = 0; j < this.bullets.length; j++) {
        const d = this.bulletGains[j * 7 + k]!;
        if (!d) continue;
        from.push(j);
        by.push(d);
      }
      gainFrom.push(from);
      gainBy.push(by);
    }
    this.resolveFn = def.resolve;
    this.mainslot = def.mainslot ?? null;
    // a kit's def is often typed loosely (`def: object`), so a bare number gets this far
    if (typeof def.timestop === "number" || typeof def.motionStop === "number") throw new Error(`${name}: timestop/motionStop are [start, end) ranges`);
    const [ts0, ts1] = def.timestop ?? [0, 0], [ms0, ms1] = def.motionStop ?? [0, 0];
    if (ts1 < ts0 || ms1 < ms0) throw new Error(`${name}: a stop's range ends before it starts`);
    this.timestopFrom = ts0;
    this.timestop = ts1 - ts0;
    this.motionStopFrom = ms0;
    this.motionStop = ms1 - ms0;
    if ("tag" in def || "cut" in def) throw new Error(`${name}: \`tag\`/\`cut\` are gone — a press with no input plays beside the fight`);    this.transition = def.transition ?? Transition.Temporary;
    // a bare frame count becomes this cast's own Cooldown, written back so every variant and
    // cancelled form of it draws on the same one
    this.cooldown = typeof def.cooldown === "number" ? new Cooldown({ frames: def.cooldown }) : def.cooldown ?? null;
    this.def = typeof def.cooldown === "number" ? { ...def, cooldown: this.cooldown! } : def;
    this.cooldownFrames = def.cooldownFrames ?? 0;
    this.gameWait = def.gameWait ?? false;
  }

  /** Where a cancel cuts this press: its last bullet committed. */
  readonly cutFrame: number;
  /** The priority this press cuts in at, null where nothing checks it: an OFF_FIELD hit, an Outro
   *  (the press before it gates it by its no-swap frames), or a press declaring none. */
  get cutIn(): number | null {
    return this.offField || this.cast === Cast.Outro ? null : this.castPriority;
  }
  /** A press beside the fight (a summon, a coordinated hit, the swap itself): no input, but a cast or a bullet —
   *  a wait has neither — unless it says `onField`. A part of a press (`half`) reads the press it is part of. */
  get offField(): boolean {
    const w = this.half !== null ? this.formOf ?? this : this;
    return (w.input === Input.None && !w.def.onField && (w.cast !== Cast.None || w.bullets.length > 0)) || isSwap(w);
  }
  /** Can it be pressed now (its conditions and `inputPriority`), read through the "current" pointers as they stand? */
  isValid(): boolean {
    const fn = this.validFn, owner = ctx.slot!;
    if (fn === null && !this.rivals(owner).length) return true;
    return resolving(() => (fn === null || fn()) && !this.outranked(owner));
  }
  /** Set `after` once every press it names is declared — presses that follow each other in a loop. Call it
   *  before any form of this press is made (`variant()`, the cuts): each copies the def as it stands. */
  setAfter(presses: readonly Action[]): void {
    if (this.def.after) throw new Error(`${this.name}: \`after\` is set already`);
    (this as { def: ActionDef }).def = { ...this.def, after: presses };
    this.validFn = buildValid(this.def);
    this.chainBound = true;
  }
  /** The presses above this one on its input in `owner`'s list (`inputActions()`), made once per list. */
  rivals(owner: TeamMember): readonly Action[] {
    const list = inputActions(owner, this.input);
    let out = (this.above ??= new WeakMap()).get(list);
    if (!out) {
      let base: Action = this;
      while (base.cancelOf ?? base.formOf) base = (base.cancelOf ?? base.formOf)!;
      out = list.filter((r) => r !== base && r.inputPriority > this.inputPriority);
      this.above.set(list, out);
    }
    return out;
  }
  private above?: WeakMap<readonly Action[], readonly Action[]>;
  /** Does a press above this one on its input take the input now: its conditions hold, a charge ready. Read
   *  as no where chain, stand or buffs read as met and on a swap-in opener (its pick is `swapInPress()`'s). */
  outranked(owner: TeamMember): boolean {
    if (ctx.validChainFree || ctx.validAnyStand || ctx.validAnyBuff) return false;
    const above = this.rivals(owner);
    if (!above.length) return false;
    const miss = ctx.validMiss;
    let by: Action | null = null;
    for (const r of above) {
      if ((r.validFn === null || r.validFn()) && r.ready(owner)) {
        by = r;
        break;
      }
    }
    // a chain-bound press taking the input is one a break or dash ahead takes away
    ctx.validMiss = miss || (by?.chainBound ?? false);
    return by !== null;
  }
  /** Has `owner` a charge of its cooldown now: part of what makes it valid to pick or search (`validFor()`,
   *  `pickInput()`); a written press is waited for instead, its charge spent before `isValid()` reads it. */
  ready(owner: TeamMember): boolean {
    return !this.cooldown || owner.cooldownAt(this.cooldown, ctx.state?.frame ?? 0).charges > 0;
  }
  /** `isValid()` as `owner` with bars `bars` (null: theirs), after `prev` and at `position` (undefined:
   *  their own last press / stand). Everything it moves is put back. */
  validOn(owner: TeamMember, bars: readonly number[] | null, prev?: Action | null, position?: Position | null): boolean {
    const fn = this.validFn;
    if (fn === null && !this.rivals(owner).length) return true;
    const slot = ctx.slot, wasPrev = ctx.validPrev, wasPos = ctx.validPosition;
    const energy = owner.energy, concerto = owner.concerto, f = owner.forte;
    const f0 = f[0], f1 = f[1], f2 = f[2], f3 = f[3], f4 = f[4];
    ctx.slot = owner;
    ctx.validPrev = prev;
    ctx.validPosition = position;
    if (bars) {
      owner.energy = bars[0]!;
      owner.concerto = bars[1]!;
      for (let i = 0; i < 5; i++) f[i] = bars[2 + i]!;
    }
    try {
      return resolving(() => (fn === null || fn()) && !this.outranked(owner));
    } finally {
      ctx.slot = slot;
      ctx.validPrev = wasPrev;
      ctx.validPosition = wasPos;
      if (bars) {
        owner.energy = energy;
        owner.concerto = concerto;
        f[0] = f0; f[1] = f1; f[2] = f2; f[3] = f3; f[4] = f4;
      }
    }
  }
  /** This press's priority at animation frame `frame` (`animPriority`), its cast priority ahead of
   *  its first window. */
  priorityAt(frame: number): number {
    let tier = this.castPriority ?? 0;
    for (const [f, t] of this.animPriority) {
      if (f > frame) break;
      tier = t;
    }
    return tier;
  }
  /** The first frame from `from` on where a press cutting in at `cast` priority beats this one —
   *  `from` itself where nothing is checked (`cast` null), Infinity where it never does. */
  freeFor(cast: number | null, from = 0): number {
    if (cast === null || this.priorityAt(from) < cast) return from;
    for (const [f, t] of this.animPriority) if (f > from && t < cast) return f;
    return Infinity;
  }
  /** What the clock charges this press cut short by `kind` (`cancelCost()`) — a method, so
   *  evaluate.ts reaches it through the type-only import it keeps on this module. */
  cost(cut: Transition | null): ReturnType<typeof cancelCost> {
    // made at other delays (a rotation of its own's): made again at these
    if (this.costAt !== DELAYS) {
      this.costAt = DELAYS;
      this.costNull = this.costDefault = undefined;
      this.costs?.clear();
    }
    // the two keys nearly every call asks, as fields
    if (cut === null) return (this.costNull ??= cancelCost(this, null));
    if (cut === Transition.Temporary) return (this.costDefault ??= cancelCost(this, cut));
    let out = this.costs?.get(cut);
    if (!out) (this.costs ??= new Map()).set(cut, (out = cancelCost(this, cut)));
    return out;
  }
  private costAt?: Delays;
  private costNull?: ReturnType<typeof cancelCost>;
  private costDefault?: ReturnType<typeof cancelCost>;
  /** `cost()` by cut, made once: an action's frames never change once built. */
  private costs?: Map<Transition | null, ReturnType<typeof cancelCost>>;
  /** What the clock charges this press let go at frame `frame` by a hold or mash: past its end, delay with nothing playing. */
  holdCost(frame: number): ReturnType<typeof cancelCost> {
    const action = this.animFrames ? Math.min(frame, this.animFrames) : frame, global = frame - action;
    const timestop = splitStop(this.timestopFrom, this.timestop, action, frame).own;
    return { action, timestop, global, total: frame - timestop };
  }
  /** What this cast banks on each bar — energy, concerto, forte 1-5 — its bullets' aside. */
  castBars(): readonly number[] {
    return this.castGains;
  }
  /** Whether this press ever holds `next` off by priority: at some frame of its animation it holds
   *  at least the tier `next` cuts in at. */
  blocks(next: Action): boolean {
    const cut = next.cutIn;
    if (cut === null) return false;
    if (this.transformFor(next) > 0) return true;
    if (this.priorityAt(0) >= cut) return true;
    for (const [f, t] of this.animPriority) if (f < this.animFrames && t >= cut) return true;
    return false;
  }
  /** `validOn()` on the bars alone, chain, stand and buffs read as met — what a hold or a visit's plan banks
   *  toward, the buffs to come unknown. */
  paysOn(owner: TeamMember, bars: readonly number[] | null): boolean {
    return this.validIn(owner, bars, true);
  }
  /** `validOn()` with its chain and stand read as met: bars and buffs only — a held press waiting. */
  standsOn(owner: TeamMember, bars: readonly number[] | null): boolean {
    return this.validIn(owner, bars, false);
  }
  private validIn(owner: TeamMember, bars: readonly number[] | null, anyBuff: boolean): boolean {
    if (this.validFn === null) return true;
    const chain = ctx.validChainFree, stand = ctx.validAnyStand, buff = ctx.validAnyBuff;
    ctx.validChainFree = ctx.validAnyStand = true;
    ctx.validAnyBuff = anyBuff;
    try {
      return this.validOn(owner, bars);
    } finally {
      ctx.validChainFree = chain;
      ctx.validAnyStand = stand;
      ctx.validAnyBuff = buff;
    }
  }
  /** Can it follow `prev` as far as its chain goes (`after()`/`notAfter()`), stand, buffs and bars aside. */
  follows(owner: TeamMember, prev: Action | null): boolean {
    const was = ctx.validAnyStand;
    ctx.validAnyStand = true;
    try {
      return !this.missesOn(owner, prev);
    } finally {
      ctx.validAnyStand = was;
    }
  }
  /** Does `validOn()` fail on its chain or stand rather than a buff or bar — what a break or dash ahead of
   *  it changes. Handlers read those first, so a missing buff never hides one. */
  missesOn(owner: TeamMember, prev: Action | null, position?: Position | null): boolean {
    if (this.validFn === null && !this.rivals(owner).length) return false;
    const was = ctx.validMiss;
    ctx.validMiss = false;
    try {
      return !this.validOn(owner, null, prev, position) && ctx.validMiss;
    } finally {
      ctx.validMiss = was;
    }
  }
  /** The frame a hold of this press pays `next`'s bars (`paysOn()`) as its cast, bullets and `pending` hits bank
   *  them (0 on the cast; its last bullet where never); `ready`: `next` stands there on the buffs held now. */
  holdPays(owner: TeamMember, bars: readonly number[], cap: readonly number[], next: Action | null, castGain: readonly number[] | null = null,
    pending: readonly { at: number; bullet: Bullet }[] = []): { at: number; ready: boolean } {
    if (!next || !next.validFn) return PAID_AT_ONCE;
    const cast = this.castGains, reset = this.resetBars;
    const g = bars.map((v, k) => bankBar(k, v, cast[k]! + (castGain?.[k] ?? 0), reset[k]!, cap));
    if (next.paysOn(owner, g)) return { at: 0, ready: next.standsOn(owner, g) };
    let last = this.bullets.length ? 0 : this.animFrames;
    const hits = [...this.bullets.map((bullet) => ({ at: bullet.hitFrame, bullet, own: true })), ...pending.map((p) => ({ ...p, own: false }))];
    for (const { at, bullet: b, own } of hits.sort((x, y) => x.at - y.at)) {
      if (at >= this.animFrames && !own) continue;
      for (let k = 0; k < 7; k++) g[k] = bankBar(k, g[k]!, barGain(b, k), false, cap);
      if (next.paysOn(owner, g)) return { at: Math.min(at, this.animFrames), ready: next.standsOn(owner, g) };
      if (own) last = at;
    }
    return { at: Math.min(last, this.animFrames), ready: next.standsOn(owner, g) };
  }
  /** The first frame from `from` on where `next` can follow this press: where `next`'s priority beats
   *  this one's, past its transform window, and into an Outro past its no-swap frames. */
  freeForNext(next: Action | null, from = 0): number {
    const swaps = next?.cast === Cast.Outro;
    const start = Math.max(from, swaps ? this.noSwapFrames : 0, this.transformFor(next));
    // played out, nothing holds it off
    return this.animFrames && start >= this.animFrames ? start : this.freeFor(next?.cutIn ?? null, start);
  }
  /** The frame its transform window holds `next` off to: none for a dash or a successful dodge, a swap or an Outro. */
  transformFor(next: Action | null): number {
    if (!this.transformFrames || !next || next.cutIn === null || next.input === Input.Dash || next.input === Input.SuccessfulDodge) return 0;
    return this.transformFrames;
  }
  /** Where a hold (or `mash`) cancel paid at `paid` (`holdPays()`) lets go: a hold the frame `next` can follow
   *  it, no sooner than `INPUT_PRECISION + HOLD_BUFFER`; a mash `MASH_SPEED` after it, no sooner than `INPUT_PRECISION`. */
  letGo(paid: number, mash = false, next: Action | null = null): number {
    if (!mash) return Math.min(this.freeForNext(next, Math.max(INPUT_PRECISION + HOLD_BUFFER, paid)), this.animFrames);
    // the window shut again by the time the mash lands: it lands MASH_SPEED after the next opening
    let at = this.freeForNext(next, Math.max(INPUT_PRECISION, paid));
    if (at === Infinity) return this.animFrames;
    at += MASH_SPEED;
    while (at < this.animFrames) {
      const free = this.freeForNext(next, at);
      if (free === at) break;
      if (free === Infinity) return this.animFrames;
      at = free + MASH_SPEED;
    }
    // past its end, the input lands with nothing playing
    return at;
  }
  /** `letGo()` of `holdPays()`: where a hold (or `mash`) cancel of this press lets go. */
  holdAt(owner: TeamMember, bars: readonly number[], cap: readonly number[], next: Action | null, castGain: readonly number[] | null = null,
    pending: readonly { at: number; bullet: Bullet }[] = [], mash = false): number {
    return this.letGo(this.holdPays(owner, bars, cap, next, castGain, pending).at, mash, next);
  }
  /** Does this take its owner off the field — what "lost on swap" reads: an Outro or the SWAP
   *  marker after a swap form, never the swap form itself. An OFF_FIELD press (a summon, a
   *  coordinated hit) lands beside the fight but moves nobody. */
  get swapOut(): boolean { return this.cast === Cast.Outro || isSwap(this); }

  /** The same cast again under `overrides` — every hook and number shared, but a new Action, so
   *  the two are told apart by identity wherever it matters (a Mainslot's off-field copy of its
   *  own hit, say). */
  variant(name: string, overrides: ActionDef): Action {
    const base: Record<string, unknown> = { ...this.def };
    if (CONDITIONS.some((k) => k in overrides)) for (const k of CONDITIONS) delete base[k];
    return new Action(name, { ...base, ...overrides } as ActionDef);
  }

  /** This press on `input` as well: a copy pointing back at it (`formOf`), so a chain or `runningAction()`
   *  reads the two as one. Made once per input — list it in the resonator's `actions` beside this one. */
  onInput(input: Input): Action {
    if (input === this.input) throw new Error(`${this.name}: already on ${INPUT_NAME[input]}`);
    let out = this.inputCopies?.get(input);
    if (!out) {
      out = this.variant(this.name, { input });
      out.formOf = this;
      (this.inputCopies ??= new Map()).set(input, out);
    }
    return out;
  }
  private inputCopies?: Map<Input, Action>;
  /** This press as the one a swap-in opens on (`Input.SwapIn`). */
  swapIn(): Action { return this.onInput(Input.SwapIn); }
  /** This press on its button held (Basic -> Basic (Hold), and Skill and Liberation alike). */
  held(): Action {
    const to = HELD_OF[this.input];
    if (to === undefined) throw new Error(`${this.name}: ${INPUT_NAME[this.input]} has no held form`);
    return this.onInput(to);
  }

  /** Meant to hand over at exactly `INPUT_PRECISION` — the engine solves the cut (`Timing.Instant`). */
  instant(): Action { return withTiming(this, { kind: Timing.Instant, frame: 0 }); }
  /** Meant to hand over at its first bullet's hit + `INPUT_PRECISION` (`Timing.FirstHit`). */
  firstHit(): Action { return withTiming(this, { kind: Timing.FirstHit, frame: 0 }); }
  /** Meant to hand over at animation frame `frame` exactly (`Timing.Timed`). */
  timed(frame: number): Action { return withTiming(this, { kind: Timing.Timed, frame }); }

  /** This cast cut at its cancel frame — its hit lands, and the clock charges `cancelCost()`.
   *  The same Action runs, so every `===` a kit makes against it still holds. */
  cancel(): Action { return new CancelledStep(this, Transition.Cancel); }
  /** This press every other time its member reaches one, skipped in between (`EveryOther`). */
  everyOther(): Action {
    if (leavesField(this)) throw new Error(`${this.name}: a swap form can't be skipped — the visit would no longer leave on it`);
    return new EveryOther(this);
  }
  /** The same, a press that isn't held mashed in: out the moment it can be cast (`holdAt()`). */
  mashCancel(): Action { return new CancelledStep(this, Transition.MashCancel); }
  /** The same, held into the next press, a held one: let go the moment it can be cast (`holdAt()`). */
  holdCancel(): Action { return new CancelledStep(this, Transition.HoldCancel); }
  /** The same, cut by a dash: a group of this press and the dash after it (`dashed()`). */
  dashCancel(): Action { return dashed(this, Transition.DashCancel); }
  /** The same, cut by a jump. */
  jumpCancel(): Action { return dashed(this, Transition.JumpCancel); }
  /** The same, a dash mashed in: out the moment the dash can be cast. */
  mashDash(): Action { return dashed(this, Transition.MashDash); }
  /** The same, a jump mashed in. */
  mashJump(): Action { return dashed(this, Transition.MashJump); }

  /** This Intro, cut or not, opening the chain played on the resonator's first arrival instead of
   *  every visit's (`IntroEntry`). */
  firstIntro(): Action { return markIntro(this, "opener"); }
  /** ...opening the chain played while they stand first in the team (`slotPosition()`). */
  inFirstSlot(): Action { return markIntro(this, "first"); }
  /** ...opening the chain played while they stand last. */
  inLastSlot(): Action { return markIntro(this, "last"); }
  /** ...opening the double-Intro pre-visit: a second Intro needed before the real one. */
  doubleIntro(): Action { return markIntro(this, "double"); }
  /** ...opening the double-Intro pre-visit played on the resonator's first arrival instead. */
  firstDoubleIntro(): Action { return markIntro(this, "firstDouble"); }

  /** This cast cancelled the moment it is pressed — its own effects (the hooks, the cast tags) with
   *  none of its hit: no motion value, element, types, scaling, or energy/concerto/off-tune/forte. */
  instaCancel(): Action { return this.instaForm(Transition.InstaCancel); }
  /** The same, the press cut by a dash, which follows it (`dashed()`). */
  instaDash(): Action { return dashed(this, Transition.InstaDash); }
  /** The same, the press cut by a jump. */
  instaJump(): Action { return dashed(this, Transition.InstaJump); }

  /** The insta forms, pointed back at the cast they cancel so `runningAction()` still reads the two
   *  as one: the cast's own effects and the bullets committed inside `INPUT_PRECISION`. */
  instaForm(kind: Transition): Action {
    // a marker has no hit of its own to strip yet: the step carries the cut to whatever it resolves to
    if (this.resolveFn) return new CancelledStep(this, kind);
    return this.hitless(kind);
  }
  private hitlessForms?: Map<string, Action>;
  /** The copy an insta cut plays, one per kind and input precision. */
  private hitless(kind: Transition): Action {
    const key = `${kind}|${INPUT_PRECISION}`;
    const seen = this.hitlessForms?.get(key);
    if (seen) return seen;
    // only the bullets committed by the time the next press comes out land
    const kept = this.bullets.filter((h) => h.commitFrame <= INPUT_PRECISION);
    // every hit lost, the cast's own banking stands
    const out = kept.length === this.bullets.length ? this.variant(this.name, { transition: kind }) : this.variant(this.name, { transition: kind, bullets: kept });
    out.cancelOf = this;
    // an insta cut that lost every hit is its cast alone
    if (!kept.length && this.bullets.length) out.half = "cast";
    (this.hitlessForms ??= new Map()).set(key, out);
    return out;
  }

  /** Does this press queue its hits and its end: any press that takes time, and always an Outro's or
   *  an insta swap's (its hits land after the swap). One taking no time plays whole. */
  splitsHit(cut: Transition | null): boolean {
    if (this.half !== null) return false;
    if (!this.bullets.length) return !this.castsInstantly && this.cost(cut).total > 0;
    if (this.cast === Cast.Outro || this.transition === Transition.InstaSwap || this.bullets.length > 1) return true;
    return this.hitDelay(0) > 0 || (!this.castsInstantly && this.cost(cut).total > 0);
  }
  /** Do the queued hits land with their owner off the field — an Outro's. A swap form's land
   *  wherever the field stands by then (its SWAP may come first), a summon's the same. */
  hitsAway(_cut: Transition | null): boolean {
    return this.cast === Cast.Outro;
  }
  /** Does the cast take none of the clock — an Outro, an OFF_FIELD hit (its frames are only the time its
   *  hits take). */
  get castsInstantly(): boolean {
    return this.cast === Cast.Outro || this.offField;
  }
  /** Real frames from the cast to bullet `k`'s hit — its own frame, time stop or not. A committed
   *  bullet lands whatever cuts the animation after the cast. */
  hitDelay(k: number): number {
    return this.bullets[k]?.hitFrame ?? 0;
  }
  /** Real frames from the cast to its last hit. */
  lastHitDelay(): number {
    if (this.lastHit === undefined) {
      let most = 0;
      for (let k = 0; k < this.bullets.length; k++) most = Math.max(most, this.hitDelay(k));
      this.lastHit = most;
    }
    return this.lastHit;
  }
  /** `lastHitDelay()`, made once: an action's frames never change once built. */
  private lastHit?: number;
  private castCopy?: Action;
  private hitCopies?: Action[];
  private endCopy?: Action;
  /** The cast of a press whose hits are queued: its frames (none where it casts instantly), what
   *  its cast banks, and every hook — evaluate() runs only the cast's (`updateGlobal`, `updateBuffs`). */
  castPart(): Action {
    if (!this.castCopy) {
      const instant = this.castsInstantly ? { animFrames: 0, animPriority: undefined, noSwapFrames: 0, transformFrames: 0, timestop: undefined } : {};
      this.castCopy = this.variant(this.name, { bullets: [], ...instant });
      this.castCopy.formOf = this;
      this.castCopy.half = "cast";
    }
    return this.castCopy;
  }
  /** Hit `k`, queued: no frames, what it deals and banks, its own element/type/subtype, and every
   *  hook — evaluate() runs only a hit's (`updateDebuffs`, `hitGlobal`, the stat phases, `onHit`). */
  hitPart(k: number): Action {
    const copies = (this.hitCopies ??= []);
    if (!copies[k]) {
      const h = this.bullets[k]!;
      const copy = this.variant(this.name, {
        bullets: [{ ...h, hitFrame: 0, commitFrame: 0 }],
        animFrames: 0, animPriority: undefined, noSwapFrames: 0, transformFrames: 0, timestop: undefined, motionStop: undefined, cooldown: undefined,
        castEnergy: 0, castConcerto: 0, castOfftune: 0, castForte1: 0, castForte2: 0, castForte3: 0, castForte4: 0, castForte5: 0,
        resetForte1: false, resetForte2: false, resetForte3: false, resetForte4: false, resetForte5: false,
        // the swap was the cast's; the hit is no transition of its own
        transition: Transition.Temporary,
      });
      copy.formOf = this;
      copy.half = "hit";
      copy.hitIndex = k;
      copies[k] = copy;
    }
    return copies[k]!;
  }
  /** The press's end, queued where its animation (or its cut) runs out: nothing dealt or banked,
   *  and only `afterAction` run. */
  endPart(): Action {
    if (!this.endCopy) {
      this.endCopy = this.variant(this.name, {
        bullets: [],
        animFrames: 0, animPriority: undefined, noSwapFrames: 0, transformFrames: 0, timestop: undefined, motionStop: undefined, cooldown: undefined,
        castEnergy: 0, castConcerto: 0, castOfftune: 0, castForte1: 0, castForte2: 0, castForte3: 0, castForte4: 0, castForte5: 0,
        resetForte1: false, resetForte2: false, resetForte3: false, resetForte4: false, resetForte5: false,
        transition: Transition.Temporary,
      });
      this.endCopy.formOf = this;
      this.endCopy.half = "end";
    }
    return this.endCopy;
  }

  /** This press as a step's `kind` plays it: an insta cut is its insta form, which carries the
   *  cut itself; any other cut is this press, cut. */
  cutAs(kind: Transition | null): [Action, Transition | null] {
    // an action has one cut: a swap, an outro or a field hit can't be cut as well
    if (kind && this.transition !== Transition.Temporary) throw new Error(`${this.name}: already ${this.transition}, can't also be ${kind}`);
    if (kind && KIND_OF[kind] === "instant" && kind !== Transition.InstaSwap) return [this.hitless(kind), null];
    return [this, kind];
  }


  /** The follow-up hit of a multi-hit coordinated attack — the same hit under the same name,
   *  but inside the lead's ICD, so it carries none of the lead's grants (no `updateBuffs`). */
  paired(): Action {
    return this.variant(this.name, { updateBuffs: undefined });
  }

  /** The press cut `INPUT_PRECISION` after its first bullet hits, the bullets committed by then landing: HIT CANCEL. */
  hitCancel(): Action {
    if (this.resolveFn) return this.swapResolver((a) => a.hitCancel());
    return this.cutOnHit(Transition.HitCancel);
  }
  /** The press cut at animation frame `frames` exactly, no delay after it — the bullets committed by
   *  then landing: CANCEL @ Nf. The next press must still out-prioritise it there. */
  cancelAt(frames: number): Action {
    if (this.resolveFn) return this.swapResolver((a) => a.cancelAt(frames));
    if (!Number.isInteger(frames) || frames < 0) throw new Error(`${this.name}: a timed cancel needs a whole frame, not ${frames}`);
    const kept = this.bullets.filter((h) => h.commitFrame <= frames);
    const out = this.variant(this.name, { transition: Transition.TimedCancel, bullets: kept });
    out.timedAt = frames;
    out.cancelOf = this;
    return out;
  }
  /** The same cut by a dash after its first hit — HIT DASH — the dash a press of its own. */
  hitDash(): Action { return this.dashOnHit(Transition.HitDash); }
  /** The same by a jump — HIT JUMP. */
  hitJump(): Action { return this.dashOnHit(Transition.HitJump); }
  private dashOnHit(kind: Transition): Action {
    const cut = this.resolveFn ? this.swapResolver((a) => a.cutOnHit(kind)) : this.cutOnHit(kind);
    return new ActionGroup(this.resolveFn ? "" : this.name, [cut, new DashMarker(kind === Transition.HitJump, this, kind)], 1);
  }
  /** The same cast swapped out of at its last commit, `INPUT_PRECISION` later: SWAP CANCEL. It plays on
   *  behind the swap, and the SWAP after it (or a 0-MV Outro) takes it off the field. */
  swapCancel(): Action { return this.swapForm(Transition.SwapCancel, (a) => a.swapCancel()); }
  /** This press cut on its first bullet's hit: the bullets committed by the time the next press
   *  comes out, `INPUT_PRECISION` on, still land. */
  private cutOnHit(kind: Transition): Action {
    if (!this.bullets.length) throw new Error(`${this.name}: a ${kind} needs a bullet to hit`);
    const first = Math.min(...this.bullets.map((h) => h.hitFrame));
    if (first === 0) throw new Error(`${this.name}: its ${kind} aims at frame 0, its first hit — write ${instaOf(kind)} instead`);
    const out = this.variant(this.name, { transition: kind, bullets: this.bullets.filter((h) => h.commitFrame <= first + INPUT_PRECISION) });
    out.onHitAt = first;
    out.cancelOf = this;
    return out;
  }

  /** The same cast swapped out of `MASH_SPEED` after its no-swap frames end (no sooner than
   *  `INPUT_PRECISION`): MASH SWAP. */
  mashSwap(): Action { return this.swapForm(Transition.MashSwap, (a) => a.mashSwap()); }
  /** The same cast swapped out of `INPUT_PRECISION` after it is pressed: INSTANT SWAP. Its hits still land
   *  once the press would have reached them (`splitsHit()`). */
  instaSwap(): Action { return this.swapForm(Transition.InstaSwap, (a) => a.instaSwap()); }
  /** The same cast swapped out of `INPUT_PRECISION` after its first bullet hits: HIT SWAP. */
  hitSwap(): Action {
    const out = this.swapForm(Transition.HitSwap, (a) => a.hitSwap());
    if (this.resolveFn) return out;
    if (!this.bullets.length) throw new Error(`${this.name}: a ${Transition.HitSwap} needs a bullet to hit`);
    const first = Math.min(...this.bullets.map((h) => h.hitFrame));
    if (first === 0) throw new Error(`${this.name}: its ${Transition.HitSwap} aims at frame 0, its first hit — write .instaSwap() instead`);
    out.onHitAt = first;
    return out;
  }
  /** A swap form, `kind`, of this press — every field its own, so it plays on behind the swap. */
  private swapForm(kind: Transition, again: (a: Action) => Action): Action {
    if (this.resolveFn) return this.swapResolver(again, kind);
    const out = this.variant(this.name, { transition: kind });
    out.formOf = this;
    return out;
  }
  /** A marker's swap form: a marker resolving to the swap form of whatever it resolves to, each
   *  made once. */
  private swapResolver(swap: (a: Action) => Action, cut?: Transition): Action {
    const resolve = this.resolveFn!, made = new Map<Action, Action>();
    const marker = new Action(this.name, {
      // a swap form's transition, so the compiler reads it as leaving the field (`leavesField()`)
      transition: cut,
      mainslot: this.def.mainslot,
      resolve: () => {
        const a = resolve();
        // nothing, or a skip (an echo whose mainslot isn't worn), has no form to take
        if (!a || a === SKIP) return a;
        let out = made.get(a);
        if (!out) made.set(a, (out = swap(a)));
        return out;
      },
    });
    if (cut) marker.formOf = this;
    return marker;
  }
}

/** A run of casts a rotation presses as one beat: `new ActionGroup("Ba123", [BA1, BA2, BA3])`
 *  wherever a single action would go. Nothing evaluates the group itself — `run()` expands it into
 *  its members before the first one is reached, so every kit hook, gauge and buff sees exactly the
 *  casts it always saw, in the same order, with the same follow-ups queued off them. The grouping
 *  is a *reporting* fact: the report folds the members into one row (display.ts), and the fight is
 *  unchanged.
 *
 *  The one place the engine does treat it as a unit is the off-tune bar: a group is one beat, so a
 *  Tune Break can only land on its last cast, never part-way through (see context.ts's
 *  `midActionGroup()` and tunebreak.ts). The break itself is not part of the group — it is queued
 *  behind that last cast like any other follow-up. */
export class ActionGroup extends Action {
  actions: Action[];
  /** How many members after the one the folded row reads — a dash group's own trailing dash, so
   *  its row shows the press that was cut. */
  trailing: number;
  constructor(name: string, actions: Action[], trailing = 0) {
    super(name);
    this.actions = actions;
    this.trailing = trailing;
  }
  // a group is cut where its last press is
  override cancel(): Action { return this.withLast((a) => a.cancel()); }
  override mashCancel(): Action { return this.withLast((a) => a.mashCancel()); }
  override holdCancel(): Action { return this.withLast((a) => a.holdCancel()); }
  override dashCancel(): Action { return this.dashLast((a) => a.dashCancel()); }
  override jumpCancel(): Action { return this.dashLast((a) => a.jumpCancel()); }
  override mashDash(): Action { return this.dashLast((a) => a.mashDash()); }
  override mashJump(): Action { return this.dashLast((a) => a.mashJump()); }
  override hitSwap(): Action { return this.withLast((a) => a.hitSwap()); }
  override instant(): Action { return this.withLast((a) => a.instant()); }
  override firstHit(): Action { return this.withLast((a) => a.firstHit()); }
  override timed(frame: number): Action { return this.withLast((a) => a.timed(frame)); }
  override instaCancel(): Action { return this.withLast((a) => a.instaCancel()); }
  override instaDash(): Action { return this.dashLast((a) => a.instaDash()); }
  override instaJump(): Action { return this.dashLast((a) => a.instaJump()); }
  override swapCancel(): Action { return this.withLast((a) => a.swapCancel()); }
  override mashSwap(): Action { return this.withLast((a) => a.mashSwap()); }
  override hitCancel(): Action { return this.withLast((a) => a.hitCancel()); }
  override cancelAt(frames: number): Action { return this.withLast((a) => a.cancelAt(frames)); }
  override hitDash(): Action { return this.dashLast((a) => a.hitDash()); }
  override hitJump(): Action { return this.dashLast((a) => a.hitJump()); }
  override instaSwap(): Action { return this.withLast((a) => a.instaSwap()); }
  // a group is skipped where its first press is, the rest going with it (`run()`)
  override everyOther(): Action {
    if (leavesField(this)) throw new Error(`${this.name}: a swap form can't be skipped — the visit would no longer leave on it`);
    return new ActionGroup(this.name, [this.actions[0]!.everyOther(), ...this.actions.slice(1)], this.trailing);
  }
  private withLast(cut: (a: Action) => Action): ActionGroup {
    return new ActionGroup(this.name, [...this.actions.slice(0, -1), cut(this.actions[this.actions.length - 1]!)]);
  }
  /** The last press's dash group, flattened into this one — `run()` expands a single level. */
  private dashLast(cut: (a: Action) => Action): ActionGroup {
    const tail = cut(this.actions[this.actions.length - 1]!) as ActionGroup;
    return new ActionGroup(this.name, [...this.actions.slice(0, -1), ...tail.actions], tail.trailing);
  }
}

/** A dash or jump cutting `after` short: the press as cut, then the dash itself as a press of
 *  its own — which dash is the resonator's (`DashMarker`). Folds into one row reading the press;
 *  opened, the dash is the row under it. */
function dashed(after: Action, kind: Transition): ActionGroup {
  const insta = KIND_OF[kind] === "instant";
  const cut = insta ? after.instaForm(kind) : new CancelledStep(after, kind);
  const jump = VIA_OF[kind] === Via.Jump;
  // a marker's group is named for what it resolves to, row by row (teamrun.ts's `toLines`)
  return new ActionGroup(after.resolveFn ? "" : after.name, [cut, new DashMarker(jump, after, kind)], 1);
}


/** The plain dash and jump — what a resonator makes on Dodge (or Jump) where none of its own presses there is
 *  valid (`Resonator.defaultActions`, `inputPriority` -1). The grounded dash and the mid-air one split by `position`. */
export const DEFAULT_DASH = new Action("Dash - Grounded", { input: Input.Dash, inputPriority: -1, animFrames: 20, cast: Cast.Dash, animPriority: { 0: 9 }, castPriority: 6,
  endPosition: Position.Grounded, position: Position.Grounded,
});

/** The plain dash made in mid-air: the grounded one's frames, cast at 7. */
export const DEFAULT_AIR_DASH = DEFAULT_DASH.variant("Dash - Mid-air", { castPriority: 7,
  endPosition: Position.Midair, position: Position.Midair,
});

/** A dash that dodged an attack, the one press every dodge counter follows: a rotation writes it where a
 *  counter comes next, on its own input (`Input.SuccessfulDodge`), always valid — no attack is modelled to read. */
// TODO possibly has time dilation making it slower?
export const SUCCESSFUL_DODGE = DEFAULT_DASH.variant("Dodge - Successful", { input: Input.SuccessfulDodge, castPriority: 8, position: undefined });


// jump from ground, backflip, or glider (need to verify backflip and glider prio)
export const DEFAULT_JUMP = new Action("Jump", { input: Input.Jump, inputPriority: -1, animFrames: 7, cast: Cast.Jump, animPriority: { 0: 9 }, castPriority: 8,
  endPosition: Position.Midair, });



/** Is `a` one of the plain dashes or the plain jump? */
export const isPlainDash = (a: Action): boolean =>
  a === DEFAULT_DASH || a === DEFAULT_AIR_DASH || a === DEFAULT_JUMP;

/** The presses `member` can make on `input`, highest `inputPriority` first: their kit's own and the defaults
 *  (`Resonator.inputActions()`); an echo's off the mainslot. */
export function inputActions(member: TeamMember, input: Input): readonly Action[] {
  if (input === Input.Echo) return member.mainslot ? byPriority(member.mainslot.actions) : NO_ACTIONS;
  return member.resonator?.inputActions(input) ?? NO_ACTIONS;
}
const NO_ACTIONS: readonly Action[] = [];
const SORTED = new WeakMap<readonly Action[], readonly Action[]>();
/** `list` highest `inputPriority` first (stable), made once per list. */
const byPriority = (list: readonly Action[]): readonly Action[] => {
  let out = SORTED.get(list);
  if (!out) SORTED.set(list, (out = [...list].sort((a, b) => b.inputPriority - a.inputPriority)));
  return out;
};
/** The press `member` makes on `input` following `prev` (undefined: their own last press): the highest valid
 *  one with a charge ready, else the first valid one waiting on its cooldown (which the engine waits out) —
 *  null where none is valid. */
export function pickInput(member: TeamMember, input: Input, prev?: Action | null): Action | null {
  const valid = inputActions(member, input).filter((a) => a.validOn(member, null, prev));
  return valid.find((a) => a.ready(member)) ?? valid[0] ?? null;
}
/** The press `member` opens on arriving with no Intro, standing `at`: their highest valid `Input.SwapIn`
 *  press, its chain waived — null where none is. */
export function swapInPress(member: TeamMember, at: Position): Action | null {
  return inputActions(member, Input.SwapIn).find((a) => validFor(member, a, Input.SwapIn, at)) ?? null;
}
/** Is `a` valid for `member` on `input` in full, whatever mode the caller reads in — a `SwapIn` read as an
 *  arrival reads it (chain waived, at `at`). */
function validFor(member: TeamMember, a: Action, input: Input, at?: Position | null): boolean {
  const chain = ctx.validChainFree, stand = ctx.validAnyStand, buff = ctx.validAnyBuff;
  ctx.validChainFree = input === Input.SwapIn;
  ctx.validAnyStand = ctx.validAnyBuff = false;
  try {
    return input === Input.SwapIn ? a.validOn(member, null, null, at) : a.validOn(member, null);
  } finally {
    ctx.validChainFree = chain;
    ctx.validAnyStand = stand;
    ctx.validAnyBuff = buff;
  }
}
/** Every press `member` could make now, on every input, cooldowns counted: a rotation search's moves. */
export function availableActions(member: TeamMember): Action[] {
  const out: Action[] = [];
  for (const input of INPUTS) {
    for (const a of inputActions(member, input)) if (a.ready(member) && validFor(member, a, input) && !out.includes(a)) out.push(a);
  }
  return out;
}
/** The inputs on which more than one of `member`'s presses is valid now, cooldowns counted — two at one
 *  `inputPriority`; none, in a kit whose priorities are written right. Not checked during a run; a search may. */
export function inputConflicts(member: TeamMember): { input: Input; actions: Action[] }[] {
  const out: { input: Input; actions: Action[] }[] = [];
  for (const input of INPUTS) {
    const valid = inputActions(member, input).filter((a) => a.ready(member) && validFor(member, a, input));
    if (valid.length > 1) out.push({ input, actions: valid });
  }
  return out;
}

const dashFor = (isJump: boolean, after: Action): Action => {
  const member = currentMember(), input = isJump ? Input.Jump : Input.Dash;
  // none valid: the first it has — `run()` refuses it where it is really cast, a plan reads it as is
  return pickInput(member, input, after) ?? inputActions(member, input)[0] ?? (isJump ? DEFAULT_JUMP : DEFAULT_DASH);
};
/** What a dash written on its own follows: this member's last press of the visit, cut or not, else
 *  the Intro they arrived on. */
const lastPress = (): Action => {
  const last = ctx.state?.lastOwn;
  let a: Action | null = last && last.member === currentMember().name ? last.action : null;
  while (a && (a.cancelOf ?? a.formOf)) a = a.cancelOf ?? a.formOf;
  return a ?? (inputActions(currentMember(), Input.Intro).length ? resolvedIntro() : ANY_INTRO);
};
/** A dodge or jump written on its own: the member's press on that input valid after the press it follows
 *  (`pickInput()`) — the echo dash after an Echo cast, a kit's own, the plain dash for where they stand. */
export const DASH = new Action("Dash Marker", { resolve: () => dashFor(false, lastPress()) });
export const JUMP = new Action("Jump Marker", { resolve: () => dashFor(true, lastPress()) });

/** The dash (or jump) a `dodge()`/`jump()` cut makes after `after`, resolved when reached the way
 *  an Intro entry is: the member's press on that input valid after it (Jingran's Shadow Step, Galbrena's
 *  Hellstride), else the plain one. Transition to an insta cancel by `run()` where the next press's cast priority beats
 *  the dash's own there. */
export class DashMarker extends Action {
  constructor(isJump: boolean, readonly after: Action, readonly kind: Transition) {
    super(isJump ? "Jump Placeholder" : "Dash Placeholder", {
      resolve: () => {
        // an echo whose mainslot isn't worn is skipped, its dash with it
        if (after.mainslot && after.resolveFn!() === SKIP) return SKIP;
        return dashFor(isJump, after instanceof IntroEntry ? resolvedIntro() : after);
      },
    });
  }
}

/** A bullet's gain on bar `k` — energy, concerto, forte 1-5. */
const barGain = (b: Bullet, k: number): number =>
  (k === 0 ? b.energy : k === 1 ? b.concerto : k === 2 ? b.forte1 : k === 3 ? b.forte2 : k === 4 ? b.forte3 : k === 5 ? b.forte4 : b.forte5);

/** A rotation step that plays `of` itself cut short by `kind` — `run()` unwraps it, so the press
 *  is the very Action the kit declared and only its frames and its row's tag differ. */
export class CancelledStep extends Action {
  constructor(readonly of: Action, readonly kind: Transition) {
    super(of.name);
  }
  override everyOther(): Action { return new CancelledStep(this.of.everyOther(), this.kind); }
  /** The same step around `of` instead — an Intro entry standing in for the Intro written. */
  rewrap(of: Action): Action { return new CancelledStep(of, this.kind); }
}

/** When a step means to hand over to the next press (`Timing`), and at which frame for `Timed`. */
export interface StepTiming { kind: Timing; frame: number }

/** A rotation step playing `of` with an intended timing (`instant()`, `firstHit()`, `timed()`): the engine solves
 *  its cut. No old cancel of its own (`Temporary`). */
export class TimedStep extends CancelledStep {
  constructor(of: Action, readonly timing: StepTiming) {
    if (of instanceof CancelledStep) throw new Error(`${of.name}: a timing goes on the press itself, not on a cut of it`);
    super(of, Transition.Temporary);
  }
  override everyOther(): Action { return new TimedStep(this.of.everyOther(), this.timing); }
  override rewrap(of: Action): Action { return new TimedStep(of, this.timing); }
}

/** The compile-time rules on `a` meaning to hand over at `t`, null where it may: an instant timing past a last
 *  commit inside `INPUT_PRECISION`, a first-hit one no later than instant or no sooner than last commit. */
export function timingProblem(a: Action, t: StepTiming): string | null {
  const lc = a.cutFrame;
  if (t.kind === Timing.Instant && lc <= INPUT_PRECISION) return `its last commit is at frame ${lc}, inside INPUT_PRECISION — leave it at last commit`;
  if (t.kind === Timing.FirstHit) {
    if (!a.bullets.length) return "it has no bullet to hit";
    const first = Math.min(...a.bullets.map((h) => h.hitFrame));
    if (first <= INPUT_PRECISION) return `its first hit is at frame ${first}, inside INPUT_PRECISION — write .instant() instead`;
    if (first + INPUT_PRECISION >= lc) return `its first hit + INPUT_PRECISION (${first + INPUT_PRECISION}) is no sooner than its last commit (${lc}) — leave it at last commit`;
  }
  if (t.kind === Timing.Timed && (!Number.isInteger(t.frame) || t.frame < 0)) return `a timed cut needs a whole frame, not ${t.frame}`;
  return null;
}
/** `a` at timing `t` as a rotation step, refused at compile time where `timingProblem()` says (a marker is read when reached). */
function withTiming(a: Action, t: StepTiming): Action {
  const why = a.resolveFn ? null : timingProblem(a, t);
  if (why) throw new Error(`${a.name}: ${t.kind} timing — ${why}`);
  return new TimedStep(a, t);
}

/** What a marker resolves to where its press is skipped (`everyOther()`): `run()` drops it, and the
 *  rest of its group. */
export const SKIP = new Action("Skip");

/** `Action.everyOther()`: `gated` every other time this member reaches one, SKIP in between — play,
 *  skip, play, skip. The count is the member's own and runs across every one in their rotation
 *  rather than per row, so a START section's copy takes the first play and the loops alternate on
 *  from there. `run()` moves it on as one is reached, never as one is peeked at. For a cast a
 *  rotation lists every visit that the kit can only pay for on half of them. A cut on it is the
 *  gated press's own, gated (`X.everyOther().cancel()` is `X.cancel().everyOther()`). */
export class EveryOther extends Action {
  constructor(readonly gated: Action) {
    super(gated.name, {
      resolve: () => (currentMember().everyOther % 2 ? SKIP : gated.resolveFn ? gated.resolveFn() : gated),
    });
  }
  override everyOther(): Action { throw new Error(`${this.name}: already every other`); }
  override cancel(): Action { return this.gated.cancel().everyOther(); }
  override mashCancel(): Action { return this.gated.mashCancel().everyOther(); }
  override holdCancel(): Action { return this.gated.holdCancel().everyOther(); }
  override dashCancel(): Action { return this.gated.dashCancel().everyOther(); }
  override jumpCancel(): Action { return this.gated.jumpCancel().everyOther(); }
  override mashDash(): Action { return this.gated.mashDash().everyOther(); }
  override mashJump(): Action { return this.gated.mashJump().everyOther(); }
  override hitSwap(): Action { return this.gated.hitSwap().everyOther(); }
  override instant(): Action { return this.gated.instant().everyOther(); }
  override firstHit(): Action { return this.gated.firstHit().everyOther(); }
  override timed(frame: number): Action { return this.gated.timed(frame).everyOther(); }
  override instaCancel(): Action { return this.gated.instaCancel().everyOther(); }
  override instaDash(): Action { return this.gated.instaDash().everyOther(); }
  override instaJump(): Action { return this.gated.instaJump().everyOther(); }
  override hitCancel(): Action { return this.gated.hitCancel().everyOther(); }
  override cancelAt(frames: number): Action { return this.gated.cancelAt(frames).everyOther(); }
  override hitDash(): Action { return this.gated.hitDash().everyOther(); }
  override hitJump(): Action { return this.gated.hitJump().everyOther(); }
  override swapCancel(): Action { return this.gated.swapCancel().everyOther(); }
  override mashSwap(): Action { return this.gated.mashSwap().everyOther(); }
  override instaSwap(): Action { return this.gated.instaSwap().everyOther(); }
}

/**
 * A field: a summon that fires on its own beside the fight for as long as it stands — Mortefi's
 * Marcato, Zhezhi's Inklit Spirits, Rebecca's turret, Denia's Erosion Field. Named once and
 * pointed at from both ends: the Buff that opens it (gear.ts's own `GearDef.field`) and every hit
 * it fires (`ActionDef.field` above). That pairing is the whole point — it is what lets the report
 * read a field's whole run of hits as one row placed under the cast that created it (solver.ts's
 * `collapseFields`), with a fresh row each time the field is opened again.
 *
 * A declaration, not a cast: unlike `ActionGroup`, which is an Action naming the casts it folds,
 * a field is never pressed and never evaluated — the summon's own hit action is.
 */
export class ActionField {
  readonly name: string;
  constructor(name: string) { this.name = name; }
}

/* ------------------------------------------------------------------------------- the markers */

/** Opens the fight's own first seconds — the opening scramble, where a support fires their
 *  baseline skill purely to get their heals and buffs up, or somebody spends the bar they walked
 *  in holding, well before anyone has the concerto for an Intro. Every member who declares a
 *  section gets a visit, in team order, each swapping straight out into the next.
 *
 *  One marker per team position, and a section only ever plays for the position it names (see
 *  `slotPosition()`): START_FIRST for the member standing first, START_LAST for the one standing
 *  last *and* playing last — no double Intro bringing anyone's visit round after theirs. What a
 *  resonator does in the fight's first seconds depends on where they stand — the leader opens the
 *  fight, the last member is usually banking something for a visit that is still two swaps away —
 *  and the same loadout sits in different positions in different teams, so one section that fired
 *  wherever they stood could only ever describe one of those. START is the section for wherever
 *  they stand, played where no position's own section is written; a member standing in neither
 *  position with no START plays no section at all.
 *
 *  The three ignore each other: a marker opens a section alongside whatever is already open rather
 *  than closing it, so markers written back to back share one body — `START_FIRST, START_LAST,
 *  Skill.swap()` is one section that reads the same from either position — and one written
 *  part-way through takes only the casts after it.
 *
 *  A section closes on a cast's `.swap()`, and sits on its own ahead of the chains — never inside
 *  one. */
export const START_FIRST = new Action("Start of Combat (First)");
export const START_LAST = new Action("Start of Combat (Last)");
export const START = new Action("Start of Combat");

/** The three above by the position each names (START last, standing for any), and the reverse
 *  lookup — which position a marker opens a section for, or -1 for anything that isn't one. */
const STARTS = [START_FIRST, START_LAST, START];
const startPosition = (action: Action): number => STARTS.indexOf(action);

/** Chain entry: on field with no Intro to cast, because nobody has outro'd yet — the visit that
 *  starts the rotation cycle. Only the team's own leader can ever use one (everyone else always
 *  arrives on somebody's Outro), so slot 1 must declare it and for slots 2 and 3 it is dead. */
export const SWAPIN = new Action("Swap In");

/** The Intro chain's entry, as the scheduler reads it: a rotation opens one with an Intro of its
 *  own, never with this, which only names the chain. */
const INTRO_ENTRY = new Action("Intro");

/** An Intro cast nobody has resolved yet: what an Outro's wait asks a kit's hold about. */
export const ANY_INTRO = new Action("Intro", { cast: Cast.Intro, endPosition: Position.Grounded });

/** The resonator's own Intro as they would cast it now: of their actions on `Input.Intro`, the one that
 *  is valid — the first where none is, read red where it is cast. */
function resolvedIntro(): Action {
  const member = currentMember(), intros = inputActions(member, Input.Intro);
  if (!intros.length) throw new Error(`${member.name} arrives on an Intro but their Resonator's actions list none`);
  return pickInput(member, Input.Intro) ?? intros[0]!;
}

/** Which chain an Intro opens: every visit's, the first arrival's (`firstIntro()`), a team
 *  position's (`inFirstSlot()` / `inLastSlot()`), the double-Intro pre-visit (`doubleIntro()`), or
 *  that pre-visit's first-arrival form (`firstDoubleIntro()`). */
export type IntroKind = "main" | "opener" | "first" | "last" | "double" | "firstDouble";
const INTRO_HELPER: Record<IntroKind, string> = { main: "", opener: ".firstIntro()", first: ".inFirstSlot()", last: ".inLastSlot()", double: ".doubleIntro()", firstDouble: ".firstDoubleIntro()" };

/** A chain's opening Intro as a rotation writes it: the kit's own Intros it may open on — one, or
 *  several written back to back (`Intro, EIntro`) — resolved when reached to whichever the
 *  resonator's `intro` picks, which has to be one of them. Transition like any press (`Intro.mashCancel()`,
 *  `Intro.cancel(), EIntro.cancel()`). */
export class IntroEntry extends Action {
  constructor(readonly kind: IntroKind, readonly intros: readonly Action[]) {
    super(intros.map((a) => a.name).join(" / "), {
      cast: Cast.Intro,
      resolve: () => {
        const want = resolvedIntro();
        if (!intros.includes(want)) {
          throw new Error(`${currentMember().name} casts ${want.name}, but the chain opens only on ${intros.map((a) => a.name).join(", ")} — list it there`);
        }
        return want;
      },
    });
  }
  // a cut on its first hit is its resolved Intro's own, which no marker can make
  override hitCancel(): Action { throw new Error(`${this.name}: an Intro opening a chain can't be cut on hit`); }
  override hitDash(): Action { throw new Error(`${this.name}: an Intro opening a chain can't be cut on hit`); }
  override hitJump(): Action { throw new Error(`${this.name}: an Intro opening a chain can't be cut on hit`); }
  override hitSwap(): Action { throw new Error(`${this.name}: an Intro opening a chain can't be cut on hit`); }
}

/** A written Intro as its parts: the Intros it opens on, the chain it opens, and how it is cut —
 *  `apply` puts that same cut on an entry. Null for anything that isn't an Intro. */
interface IntroForm { kind: IntroKind; intros: readonly Action[]; cut: string; apply: (entry: Action) => Action }
const DASH_OF: Partial<Record<Transition, (a: Action) => Action>> = {
  [Transition.DashCancel]: (a) => a.dashCancel(), [Transition.JumpCancel]: (a) => a.jumpCancel(),
  [Transition.InstaDash]: (a) => a.instaDash(), [Transition.InstaJump]: (a) => a.instaJump(),
  [Transition.MashDash]: (a) => a.mashDash(), [Transition.MashJump]: (a) => a.mashJump(),
};
const FORM_OF: Partial<Record<Transition, (a: Action) => Action>> = {
  [Transition.InstaCancel]: (a) => a.instaCancel(), [Transition.SwapCancel]: (a) => a.swapCancel(),
  [Transition.InstaSwap]: (a) => a.instaSwap(), [Transition.MashSwap]: (a) => a.mashSwap(),
};
function introForm(a: Action): IntroForm | null {
  const core = (x: Action | null): { kind: IntroKind; intros: readonly Action[] } | null =>
    !x ? null : x instanceof IntroEntry ? { kind: x.kind, intros: x.intros }
      : x.cast === Cast.Intro && !x.resolveFn && x.transition === Transition.Temporary ? { kind: "main", intros: [x] } : null;
  const form = (x: Action | null, cut: string, apply: (e: Action) => Action): IntroForm | null => {
    const c = core(x);
    return c && { ...c, cut, apply };
  };
  if (a instanceof CancelledStep) return form(a.of, a.kind, (e) => a.rewrap(e));
  if (a instanceof ActionGroup) {
    const dash = a.actions[1];
    if (a.actions.length !== 2 || !(dash instanceof DashMarker) || !DASH_OF[dash.kind]) return null;
    return form(dash.after, dash.kind, DASH_OF[dash.kind]!);
  }
  const base = a.cancelOf ?? a.formOf;
  if (base && FORM_OF[a.transition]) return form(base, a.transition, FORM_OF[a.transition]!);
  return form(a, "", (e) => e);
}
/** `.firstIntro()` and the rest: the same Intro, cut as it was, opening `kind`'s chain. */
function markIntro(a: Action, kind: IntroKind): Action {
  const f = introForm(a);
  if (!f) throw new Error(`${a.name}${INTRO_HELPER[kind]}: only an Intro opens a chain`);
  if (f.kind !== "main") throw new Error(`${a.name}${INTRO_HELPER[kind]}: already ${INTRO_HELPER[f.kind]}`);
  return f.apply(new IntroEntry(kind, f.intros));
}
/** A kit's own Outro, written bare. */
const bareOutro = (a: Action): boolean => a.cast === Cast.Outro && !a.resolveFn && !(a instanceof CancelledStep);
/** A rotation's entries with each run of Intros written back to back (`Intro, EIntro`) made one
 *  entry: the Intros its chain may open on, each cut alike and opening the same kind of chain. */
function mergeIntros(written: readonly Action[]): Action[] {
  const out: Action[] = [];
  for (let k = 0; k < written.length;) {
    // a chain leaves on the one Outro it really casts
    if (bareOutro(written[k]!) && written[k + 1] && bareOutro(written[k + 1]!)) {
      throw new Error(`rotation: ${written[k]!.name}, ${written[k + 1]!.name} — write only the Outro this chain leaves on`);
    }
    const f = introForm(written[k]!);
    if (!f) {
      out.push(written[k++]!);
      continue;
    }
    const run: Action[] = [];
    const intros: Action[] = [];
    for (let g: IntroForm | null; k < written.length && (g = introForm(written[k]!)); k++) {
      run.push(written[k]!);
      if (g.kind !== f.kind || g.cut !== f.cut) throw new Error(`rotation: ${run.map((a) => a.name).join(", ")} — Intros written together are cut alike and open the same chain`);
      for (const a of g.intros) {
        if (intros.includes(a)) throw new Error(`rotation: ${a.name} written twice in one run of Intros`);
        intros.push(a);
      }
    }
    out.push(f.apply(new IntroEntry(f.kind, intros)));
  }
  return out;
}
/** The Intro entry a written press opens on, cut or grouped — null for any other press. */
function entryOf(a: Action): IntroEntry | null {
  const first = unstep(a instanceof ActionGroup ? a.actions[0]! : a)[0];
  const x = first.formOf ?? first.cancelOf ?? first;
  return first instanceof IntroEntry ? first : x instanceof IntroEntry ? x : null;
}

/** The named position slot `i` stands in — 0 first, 1 last, -1 neither. The last slot is only
 *  last when nobody plays after it: a double-Intro leader brings their own main visit, and every
 *  other double-Intro member's, round after a last slot without one. */
export function slotPosition(rotations: Rotation[], i: number): number {
  const last = rotations.length - 1;
  if (i === 0) return 0;
  if (i !== last) return -1;
  return !rotations[0]!.doubles.length || rotations[last]!.doubles.length ? 1 : -1;
}

/** The markers `after()`/`notAfter()` read as any press of their cast (`ctx.castMarker`). */
let CAST_MARKERS: Map<Action, Cast> | null = null;
const castMarkers = (): Map<Action, Cast> =>
  (CAST_MARKERS ??= new Map([[DASH, Cast.Dash], [JUMP, Cast.Jump]]));
ctx.castMarker = (a) => castMarkers().get(a) ?? Cast.None;


/** The double-Intro pre-visit's entry, as the scheduler reads it. Opened by an Intro's
 *  `.doubleIntro()`: a second Intro this resonator needs *before* their real one — usually a main DPS
 *  banking Intro effects twice. It takes the outro that would have opened the previous
 *  resonator's visit: the owner's Intro is cast, the section's casts play, and it leaves on its
 *  last cast's `.swap()` back — the previous resonator's visit is then their SWAPIN chain, whose outro
 *  hands forward for the main Intro chain. Closed by an Outro of its own instead, the handback
 *  is that real outro, the previous resonator plays their whole normal visit in between, and no
 *  SWAPIN chain is needed. */
const DOUBLE_ENTRY = new Action("Double Intro");

/** The no-Intro chain's own first-arrival form: played in place of SWAPIN the one time a
 *  resonator arrives having never played, and only then — a leader's opening visit, or the first
 *  time a swap-out hands them the field. Every arrival after takes the ordinary SWAPIN chain. It
 *  is what `.firstIntro()` is for the other entry: a kit whose opening visit has something the loop
 *  hasn't (Hiyuki's fourth Iai, bought by being out of combat) writes it once here. Closed by an
 *  Outro of its own, or run into a `.firstIntro()` chain to share that chain's tail, exactly as
 *  SWAPIN may run into an Intro. */
export const SWAPIN_OPENER = new Action("Swap In (Opener)");


/** A chain's exit when it leaves on its last cast's `.swap()` rather than an Outro — never
 *  written or played, only compared: SWAP plays in its place, and the next slot plays their
 *  SWAPIN chain, which they must declare. */
const SWAP_EXIT = new Action("Swap Exit");

/** The swap out, as it plays: named for where the resonator swapped in will stand. */
const SWAP_GROUNDED = new Action("Swap - Grounded");
const SWAP_MIDAIR = new Action("Swap - Mid-air");
/** The swap out: after a swap form unless an Outro follows (`runRotations()` puts it in), or written
 *  after a press played out. No frames, no delay, no cast — an OFF_FIELD row, dimmed. Its cast and
 *  an Outro's are the only things that take a resonator off the field. It resolves to where the one
 *  swapped in will stand: inside the start sections on the ground, else where the one leaving stands.
 *  On every resonator's Outro input below a full Concerto, picked where none of its own Outros is valid. */
export const SWAP = new Action("Swap", {
  input: Input.Outro, inputPriority: -1, maxConcerto: 9999,
  resolve: () => {
    const s = ctx.state!;
    return (!s.inStart || s.toOpener) && currentMember().position === Position.Midair ? SWAP_MIDAIR : SWAP_GROUNDED;
  },
});
/** The swap out as written or as it plays. */
export const isSwap = (a: Action): boolean => a === SWAP || a === SWAP_GROUNDED || a === SWAP_MIDAIR;
// the presses every resonator has on these inputs, below its own (`inputPriority` -1)
DEFAULT_PRESSES.fallbacks = [DEFAULT_DASH, DEFAULT_AIR_DASH, DEFAULT_JUMP, SWAP];

/* ------------------------------------------------------------------------------ the rotation */

/** One visit to the field: what this resonator does, and how they leave. The entry marker is not
 *  in `body` — an Intro is prepended by the scheduler, and neither of the other two is a cast. An
 *  inline start-of-combat section still is, brackets and all: the scheduler strips the markers and,
 *  on a first visit, everything between them (see `runRotations()`). */
export interface Chain {
  entry: Action;
  /** The Intro an entry casts, as the rotation wrote it (`Intro.cancel()`) — unused by a SWAPIN
   *  chain. */
  cast?: Action;
  /** The Intros it opens on — the arrival whose `intro` picks one of them plays it. */
  intros?: readonly Action[];
  /** A SWAPIN chain's first press — the arrival whose `swapIn` picks it plays the chain. */
  swapIn?: Action;
  body: Action[];
  /** The outro the rotation wrote, or SWAP_EXIT for a chain that leaves on its last cast's `.swap()`. */
  exit: Action;
}

/** A visit's cooldown-gated presses and how many frames after its handoff each comes up, off what
 *  its presses charge the clock — for a handoff into a visit not played yet. Every gated press
 *  counts, a cooldown used twice twice. `hasIntro`: the arriving member declares one (none: no timing
 *  past it), and `resolve` reads a marker (the Intro entry cut as written, an echo) the way the
 *  incoming member would reach it, on the bars the presses before it bank; one resolving to no
 *  press takes no time. Leaves out the engine's own follow-ups, so a press can come up later than
 *  this says, never earlier. */
export function chainGates(chain: Chain, owner: TeamMember, hasIntro: boolean, resolve: (marker: Action, bars: readonly number[]) => Action | null, bars: readonly number[], cap: readonly number[]): VisitGate[] {
  // every press as it will play: a marker resolved, a hold cancel reading the press after it
  const presses: { pressed: Action; a: Action; cut: Transition | null }[] = [];
  const { members, lastMarker } = chainMembers(chain);
  // the bars each marker resolves on: every press before it banked whole (Sigrika's Skill reads
  // the Full Stop her Schemata banked)
  const seen = [...bars];
  let gated = false;
  for (let n = 0; n < members.length; n++) {
    const m = members[n]!;
    // the Intro as written, cut and all — its entry resolves to the arriving member's own
    if (m === chain.cast && !hasIntro) break;
    const stepped = m instanceof CancelledStep, marked = stepped ? m.of : m;
    const pressed = marked.resolveFn ? resolve(marked, seen) : marked;
    // a marker resolving to no press at all (a summon echo's dash) takes no time
    if (!pressed || pressed === SKIP) continue;
    if (pressed.resolveFn) break;
    const [a, cut] = stepped && m.kind ? pressed.cutAs(m.kind) : [pressed, null];
    presses.push({ pressed, a, cut });
    if (a.cooldown) gated = true;
    if (n < lastMarker) bankPress(seen, a, cap, -1);
  }
  if (!gated) return [];
  // the bars run through the visit, each press banking its cast and the bullets it keeps — read
  // only by a hold cancel, so banked up to the last one and no further
  let lastHold = -1;
  for (let n = 0; n < presses.length; n++) if (presses[n]!.cut && waitsForNext(presses[n]!.cut!)) lastHold = n;
  const out: VisitGate[] = [];
  const g = [...bars];
  let t = 0;
  for (let n = 0; n < presses.length; n++) {
    const { pressed, a, cut } = presses[n]!;
    if (a.cooldown) out.push({ cd: a.cooldown, offset: t, press: pressed.name });
    const hold = cut && waitsForNext(cut) ? a.holdAt(owner, g, cap, presses[n + 1]?.pressed ?? null, null, [], KIND_OF[cut] === "mash") : -1;
    t += (hold >= 0 ? a.holdCost(hold) : a.cost(cut ?? a.transition)).total;
    if (n < lastHold) bankPress(g, a, cap, hold);
  }
  return out;
}

/** A chain's presses as written, its Intro first and every group opened, and the position of the
 *  last one that is a marker — what `chainGates()` walks, made once per chain. */
const CHAIN_MEMBERS = new WeakMap<Chain, { members: Action[]; lastMarker: number }>();
function chainMembers(chain: Chain): { members: Action[]; lastMarker: number } {
  let known = CHAIN_MEMBERS.get(chain);
  if (!known) {
    const members = (chain.cast ? [chain.cast, ...chain.body] : chain.body).flatMap((entry) => (entry as ActionGroup).actions ?? [entry]);
    let lastMarker = -1;
    members.forEach((m, n) => { if ((m instanceof CancelledStep ? m.of : m).resolveFn) lastMarker = n; });
    CHAIN_MEMBERS.set(chain, (known = { members, lastMarker }));
  }
  return known;
}

/** `g` (energy, concerto, forte 1-5) as `a`'s cast and bullets bank it — only the bullets committed
 *  by `hold` where a hold cancel lets go there (-1: every one). */
function bankPress(g: number[], a: Action, cap: readonly number[], hold: number): void {
  const reset = a.resetBars, bullets = a.bullets;
  for (let k = 0; k < 7; k++) {
    // a zero gain banks as `+ 0`, which only the closing `+ 0` can still show
    let v = reset[k] ? 0 : g[k]!;
    const from = a.gainFrom[k]!, by = a.gainBy[k]!;
    for (let t = 0; t < from.length; t++) {
      const j = from[t]!;
      if (j >= 0 && hold >= 0 && bullets[j]!.commitFrame > hold) continue;
      v = bank(v, by[t]!, cap[k]!);
    }
    g[k] = v + 0;
  }
}

/** A chain as the compiler builds it: its casts so far and how it leaves — an Intro chain's (or a
 *  pre-visit's) with every Intro entry it holds where it is written, each a place an arrival on one
 *  of its Intros starts — and `into`, for a no-Intro chain, the Intro chain it ran into and shares
 *  its tail with. */
interface Building {
  kind: "intro" | "preVisit" | "noIntro" | "noIntroOpener";
  body: Action[];
  exit: Action | null;
  into: Building | null;
}

/** A resonator's rotation, compiled into the ways they can arrive. Only an every-visit Intro chain
 *  is required: a resonator with no start-of-combat section for the position they stand in sits
 *  out the fight's opening scramble, one with no SWAPIN chain simply can't lead a team, and
 *  `doubles` are the pre-visits a double Intro declares (see `runRotations()`). Each kind of Intro
 *  chain is a list, one chain per set of Intros it opens on: the arrival plays the one listing the
 *  Intro their `intro` picks. */
export class Rotation {
  /** What each start-of-combat section holds, by the team position it is for (START_FIRST/LAST,
   *  then START's for any) — body only, closing cast included. `null` where none is declared. */
  startCombat: (Action[] | null)[] = [null, null, null];
  /** The SWAPIN chains, one per press a swap-in may open on (`swapInPress()`). */
  openers: Chain[] = [];
  /** The every-visit Intro chains. */
  mains: Chain[] = [];
  /** The double-Intro pre-visits: each `exit` SWAP_EXIT for the swap-back form (its last cast's
   *  `.swap()`, running into the Intro) or its outro for the outro-back form, all alike. */
  doubles: Chain[] = [];
  /** The pre-visits' first-arrival forms (`.firstDoubleIntro()`), played in place of one on this
   *  resonator's first arrival. */
  firstDoubles: Chain[] = [];
  /** The first-arrival chains (`.firstIntro()`), played in place of an every-visit one on this
   *  resonator's first arrival. */
  firstIntros: Chain[] = [];
  /** The SWAPIN_OPENER chains, played in place of `openers` on that same first arrival. */
  firstOpeners: Chain[] = [];
  /** The chains played in place of an every-visit one while this resonator stands first or last
   *  (`.inFirstSlot()` / `.inLastSlot()`, `slotPosition()`). */
  slotIntros: [Chain[], Chain[]] = [[], []];
  /** What compiling the written list threw: the loadout naming this rotation throws it under its
   *  resonator's name (`Loadout`), which the list itself doesn't know. */
  error: Error | null = null;
  /** The delays its member's presses play at (`withDelays()`), null for the defaults. */
  delays: Delays | null = null;

  /** A rotation played at delays of its own (`{ precision: 1 }`): `write` builds its list
   *  under them, so its insta and on-hit cuts keep what they commit by then, and its member's presses play at them. */
  static withDelays(d: Partial<Delays>, write: () => readonly Action[]): Rotation {
    const delays = delaysWith(d);
    useDelays(delays);
    try {
      const out = new Rotation(write());
      out.delays = delays;
      return out;
    } finally {
      useDelays(null);
    }
  }

  constructor(actions: readonly Action[]) {
    try {
      this.compile(actions);
    } catch (e) {
      this.error = e instanceof Error ? e : new Error(String(e));
    }
  }

  private compile(written: readonly Action[]): void {
    // which positions' start-of-combat sections are open — more than one where the markers were
    // written back to back, which is how a section that reads the same from two positions is
    // spelled (`START_FIRST, START_LAST, Skill.swap()`) — and what each has collected
    let inStart: number[] = [];
    const starts: (Action[] | null)[] = [null, null, null];
    const built: Building[] = [];
    let open: Building | null = null;
    const begin = (kind: Building["kind"]): Building => {
      const b: Building = { kind, body: [], exit: null, into: null };
      built.push(b);
      open = b;
      return b;
    };
    // an Outro entry or SWAP_EXIT ending whichever chain is open
    const close = (exit: Action): void => {
      if (!open) throw new Error(`rotation: ${exit.name} closes a chain that was never opened`);
      open.exit = exit;
      open = null;
    };
    // the chain open, its last cast leaving on a `.swap()` — what closes it without an outro
    const leftOnSwap = (): boolean => {
      const b = open as Building | null;
      return !!b && !inStart.length && b.body.length > 0 && leavesField(b.body[b.body.length - 1]!);
    };
    const entries = mergeIntros(written);
    checkEchoRuns(entries);
    while (entries.length) {
      const action = entries.shift()!;
      const [bare, step] = unstep(action);
      const entry = entryOf(action);
      const now = open as Building | null;
      // a written SWAP closes the chain open on the press before it, played out — the scheduler plays
      // the swap itself, behind any wait for the next visit (a section keeps it as its last entry)
      if (action === SWAP && !inStart.length) {
        if (entries[0] && isOutro(unstep(entries[0])[0])) throw new Error("rotation: SWAP right before an Outro — the Outro is the swap: write one or the other");
        if (!now || !now.body.length) throw new Error("rotation: SWAP with no press before it in its chain");
        close(SWAP_EXIT);
        continue;
      }
      if (step && (isOutro(bare) || bare === SWAPIN || bare === SWAPIN_OPENER || startPosition(bare) >= 0)) {
        throw new Error(`rotation: ${bare.name} can't be cut short`);
      }
      if (startPosition(action) >= 0) {
        const at = startPosition(action);
        if (starts[at]) throw new Error(`rotation: only one ${action.name} section`);
        if (now) throw new Error(`rotation: ${action.name} opens its section inside a chain; it goes ahead of them`);
        // opens alongside whatever is already open rather than closing it: every position whose
        // marker is still open collects what follows, so back-to-back markers share one body and
        // a marker written part-way through takes only the tail after it
        starts[at] = [];
        inStart.push(at);
      } else if (inStart.length) {
        if (isOutro(action) || opensChain(action)) {
          throw new Error(`rotation: the ${inStart.map((at) => STARTS[at]!.name).join(" / ")} section is never closed by a cast's .swap()`);
        }
        for (const at of inStart) starts[at]!.push(action);
        // the cast that leaves the field is the section's last, the other mainslots' beside it included
        if (leavesField(action) && !besideEcho(action, entries[0])) inStart = [];
      } else if (opensChain(action) && leftOnSwap()) {
        // a chain whose last cast left on its `.swap()` is closed by it: the entry opens the next
        close(SWAP_EXIT);
        entries.unshift(action);
      } else if (action === SWAPIN || action === SWAPIN_OPENER) {
        const kind = action === SWAPIN ? "noIntro" : "noIntroOpener";
        if (now) throw new Error(`rotation: ${action.name} opens a chain while one is still open`);
        begin(kind);
      } else if (entry) {
        const kind = entry.kind, pre = kind === "double" || kind === "firstDouble";
        // an Intro inside an open Intro chain is another place it starts: an arrival on it opens
        // there, and one opening earlier passes it by
        if (now && (now.kind === "intro" || now.kind === "preVisit")) {
          if ((now.kind === "preVisit") !== pre) {
            throw new Error(pre ? `rotation: ${entry.name}${INTRO_HELPER[kind]} opens a pre-visit inside an every-visit chain` : "rotation: a double-Intro pre-visit runs into the Intro without leaving on a cast's .swap()");
          }
          now.body.push(action);
          continue;
        }
        // the walk-through: an Intro reached inside an open no-Intro chain isn't cast there, it just
        // marks where the tail the two share begins — a SWAPIN chain into an every-visit or a
        // pre-visit chain, a SWAPIN_OPENER into a first-arrival one
        const walks = now && ((now.kind === "noIntro" && (kind === "main" || kind === "double")) || (now.kind === "noIntroOpener" && kind === "opener"));
        if (now && !walks) throw new Error(`rotation: ${entry.name}${INTRO_HELPER[kind]} opens a chain while one is still open`);
        const b = begin(pre ? "preVisit" : "intro");
        b.body.push(action);
        if (now) now.into = b;
      } else if (isOutro(action)) {
        close(action);
      } else {
        if (!now) throw new Error(`rotation: ${action.name} sits outside any action chain`);
        now.body.push(action);
      }
    }

    if (inStart.length) throw new Error(`rotation: the ${inStart.map((at) => STARTS[at]!.name).join(" / ")} section is never closed by a cast's .swap()`);
    if (open && leftOnSwap()) close(SWAP_EXIT);
    if (open) throw new Error("rotation: a chain is left open with neither an outro nor a .swap() to close it");
    this.startCombat = starts.map((cast) => (cast && cast.length ? cast : null));

    // what an arrival starting at `k` plays: the casts after it, every other Intro entry passed by
    const tail = (b: Building, k: number): Action[] => b.body.slice(k + 1).filter((a) => !entryOf(a));
    for (const b of built) {
      if (b.kind !== "intro" && b.kind !== "preVisit") continue;
      b.body.forEach((cast, k) => {
        const at = entryOf(cast);
        if (!at) return;
        // a first-arrival chain's entry is an Intro chain's: it is one in every way the scheduler
        // cares about, and only which visit plays it differs
        const chain: Chain = { entry: b.kind === "preVisit" ? DOUBLE_ENTRY : INTRO_ENTRY, cast, intros: at.intros, body: tail(b, k), exit: b.exit! };
        const into = { main: this.mains, opener: this.firstIntros, first: this.slotIntros[0], last: this.slotIntros[1], double: this.doubles, firstDouble: this.firstDoubles }[at.kind];
        into.push(chain);
      });
    }
    // a rotation written only for named positions has no every-visit chain of its own: the first
    // position written stands in wherever no chain is named
    if (!this.mains.length) this.mains = [...(this.slotIntros.find((c) => c.length) ?? [])];
    if (!this.mains.length) throw new Error("rotation: every rotation needs an Intro chain closed by an outro");
    if (this.firstDoubles.length && !this.doubles.length) throw new Error("rotation: a .firstDoubleIntro() pre-visit stands in for a .doubleIntro() one, and there is none");
    const pre = [...this.doubles, ...this.firstDoubles];
    if (pre.some((c) => (c.exit === SWAP_EXIT) !== (pre[0]!.exit === SWAP_EXIT))) {
      throw new Error("rotation: every double-Intro pre-visit leaves the same way — all on a cast's .swap(), or all on an outro");
    }
    for (const [what, chains] of [["Intro", this.mains], ["first-arrival", this.firstIntros], ["first-slot", this.slotIntros[0]], ["last-slot", this.slotIntros[1]],
      ["double-Intro", this.doubles], ["first double-Intro", this.firstDoubles]] as const) {
      const seen = new Set<Action>();
      for (const c of chains) {
        for (const a of c.intros!) {
          if (seen.has(a)) throw new Error(`rotation: two ${what} chains both open on ${a.name}`);
          seen.add(a);
        }
      }
    }

    // a no-Intro chain: its own casts, then whatever the Intro chain it ran into does, minus the
    // Intro nobody could have handed them — leaving as that chain does, or on an outro of its own
    for (const b of built) {
      if (b.kind !== "noIntro" && b.kind !== "noIntroOpener") continue;
      const into = b.into;
      // the swap-back form hands to the previous slot's SWAPIN chain, and a leader has none to hand to
      if (into?.kind === "preVisit" && (!into.exit || into.exit === SWAP_EXIT)) {
        throw new Error("rotation: a SWAPIN chain shared with a double-Intro pre-visit needs that pre-visit closed by an outro, not run into the Intro");
      }
      const body = into ? [...b.body, ...tail(into, 0)] : b.body;
      if (!body.length) throw new Error("rotation: a SWAPIN chain with no press to open on");
      const chain: Chain = { entry: SWAPIN, swapIn: pressOf(body[0]!), body, exit: b.exit ?? into!.exit! };
      const list = b.kind === "noIntro" ? this.openers : this.firstOpeners;
      if (list.some((c) => c.swapIn === chain.swapIn)) throw new Error(`rotation: two ${b.kind === "noIntro" ? "SWAPIN" : "SWAPIN_OPENER"} chains both open on ${chain.swapIn!.name}`);
      list.push(chain);
    }
  }
}

/** The press a written entry makes, whatever its cut — a group's first: what a swap-in opens on. */
function pressOf(a: Action): Action {
  let x = unstep(a instanceof ActionGroup ? a.actions[0]! : a)[0];
  while (x.cancelOf ?? x.formOf) x = (x.cancelOf ?? x.formOf)!;
  return x;
}
/** The Intro-cast press a written entry holds — cut or not, or a group's first. */
function introOf(a: Action): Action {
  const first = a instanceof ActionGroup ? a.actions[0]! : a;
  const bare = unstep(first)[0];
  return bare;
}
/** Is this written entry an Intro cast (`cast` Intro), however it is written? */
const isIntro = (a: Action): boolean => introOf(a).cast === Cast.Intro;
/** Is it an outro — the kit's Outro or its Outro Resolver? What closes a chain. */
const isOutro = (a: Action): boolean => a.cast === Cast.Outro;
/** Does it open a chain — an Intro or an entry marker — what a chain left
 *  open on a `.swap()` runs into. */
const opensChain = (a: Action): boolean =>
  isIntro(a) || [SWAPIN, SWAPIN_OPENER].includes(a);
const unstep = (a: Action): [Action, CancelledStep | null] => (a instanceof CancelledStep ? [a.of, a] : [a, null]);

/** Does this entry leave the field — a written SWAP, a cast's `swap()` / `instaSwap()` form, or a
 *  group ending on one? What closes a start-of-combat section. */
function leavesField(a: Action): boolean {
  const last = a instanceof ActionGroup ? a.actions[a.actions.length - 1]! : a;
  if (last === SWAP) return true;
  return isSwapTransition(last.transition) && (last.formOf ?? last.cancelOf) !== null;
}
/** The mainslot an entry's echo cast plays for, cut or grouped, or null for no echo's. */
function echoOf(a: Action): Mainslot | null {
  const first = a instanceof ActionGroup ? a.actions[0]! : a;
  return unstep(first)[0].mainslot;
}
/** Is `b` another mainslot's echo written beside `a`'s: of the two, at most one ever plays. */
function besideEcho(a: Action, b: Action | undefined): boolean {
  const own = echoOf(a), other = b ? echoOf(b) : null;
  return own !== null && other !== null && own !== other;
}
/** Where the run of mainslot echoes `list` ends on starts — `list.length - 1` where it ends on
 *  anything else. */
function trailingRun(list: Action[]): number {
  let k = list.length - 1;
  while (k > 0 && echoOf(list[k]!) && echoOf(list[k - 1]!)) k--;
  return k;
}
/** A run of echoes written for several mainslots, each its stages in turn, is one entry to whatever
 *  reads where the visit leaves: every mainslot's last press leaves the field, or none does. */
function checkEchoRuns(list: readonly Action[]): void {
  let lead: Action | null = null;
  for (let k = 0; k < list.length; k++) {
    const a = list[k]!, next = list[k + 1], own = echoOf(a);
    if (!own) {
      lead = null;
      continue;
    }
    // a mainslot's earlier stages: only its last press can leave
    if (next && echoOf(next) === own) continue;
    if (lead && leavesField(lead) !== leavesField(a)) {
      throw new Error(`rotation: ${lead.name} and ${a.name} stand in for each other, but only one of them swaps out — write both as swap forms, or neither`);
    }
    lead ??= a;
  }
}
/** A swap form goes last in its chain or section, or right before its Outro — `list` as `who`
 *  plays it. The other mainslots' echoes written beside it never play with it. */
function checkSwapOuts(who: string, list: Action[]): void {
  list.forEach((a, k) => {
    let n = k + 1;
    while (besideEcho(a, list[n])) n++;
    const next = list[n];
    const inner = a instanceof ActionGroup && a.actions.slice(0, -1).some(leavesField);
    if (!inner && !(leavesField(a) && next && !isOutro(next))) return;
    throw new Error(`${who}: ${a.name} swaps out with ${next?.name ?? "its own group"} still to play — a swap form goes last in its chain, or right before its Outro`);
  });
}
/** A swap form written ahead of a mainslot echo the member wears is that press cut without leaving:
 *  a swap cancel or mash swap its plain/mash cancel, an insta swap its insta cancel. */
const UNSWAPPED = new Map<Action, Action>();
function unswap(a: Action): Action {
  let out = UNSWAPPED.get(a);
  if (out) return out;
  if (a instanceof ActionGroup) out = new ActionGroup(a.name, [...a.actions.slice(0, -1), unswap(a.actions[a.actions.length - 1]!)]);
  else {
    const base = (a.formOf ?? a.cancelOf)!;
    out = a.transition === Transition.InstaSwap ? base.instaCancel() : a.transition === Transition.MashSwap ? base.mashCancel() : a.transition === Transition.HitSwap ? base.hitCancel() : base.cancel();
  }
  UNSWAPPED.set(a, out);
  return out;
}
function keepOnForEcho(worn: Mainslot | null, list: Action[]): Action[] {
  if (!worn) return list;
  let out: Action[] | null = null;
  for (let k = 0; k < list.length - 1; k++) {
    const a = list[k]!;
    if (a === SWAP || echoOf(a) || !leavesField(a)) continue;
    let n = k + 1, plays = false;
    for (; n < list.length && echoOf(list[n]!); n++) if (echoOf(list[n]!) === worn) plays = true;
    if (n === k + 1) continue;
    out ??= list.slice();
    // an echo it won't wear is skipped anyway: the swap stands, right before what follows
    if (plays) out[out.length - list.length + k] = unswap(a);
    else out.splice(out.length - list.length + k + 1, n - k - 1);
  }
  return out ?? list;
}
/** The same entry pressed without leaving: what a start section's closing cast plays when there
 *  is nobody to swap to, and its owner stays on field. */
function staysOnField(a: Action): Action {
  if (a instanceof ActionGroup) return new ActionGroup(a.name, [...a.actions.slice(0, -1), staysOnField(a.actions[a.actions.length - 1]!)]);
  return a.formOf ?? a.cancelOf ?? a;
}

/* ----------------------------------------------------------------------------- the scheduler */

/**
 * Run every member's rotation across `state`, in the order the fight actually goes.
 *
 * The opening scramble first: every start-of-combat section written for the position its own
 * member actually stands in, in team order, each ending on a
 * plain swap into the next (and the last of them swapping to slot 1). A section written inline in
 * its own rotation is then skipped on that member's first visit — they just spent it — and plays
 * normally on every visit after. Then slot 1's own SWAPIN
 * chain, since nobody has outro'd yet and so nobody has an Intro to cast. From there it is Intro
 * chains all the way — an Outro hands the field on, whoever it lands on runs theirs — until every
 * section is filled.
 *
 * A leader with a DOUBLE_INTRO section of their own changes the trip's shape: every pre-visit in
 * team order, a member without one playing their only visit in its place, then every main visit
 * in team order (Jinhsi > Hsin > Shorekeeper reads Jin1 Hsin1 SK Jin2 Hsin2), the opener standing
 * in for the leader's first pre-visit.
 *
 * A section closes on the *last* slot's own Outro or swap — one full trip round the team — and the
 * next opens on that handoff frame: the incoming Intro, the outro's follow-ups and every hit landing
 * past it are the next section's. Trips go on until `count` sections have closed; the fight ends on
 * the final Outro or swap itself, and nothing landing past it counts. With a `limit` (game frames) they
 * go on until the game timer reaches it instead: the fight is cut there, mid-visit, nothing pressed past
 * it, and `complete` counts the sections that closed by then.
 */
/** Why a team can't be scheduled at all, or `null` if it can — the checks the scheduler makes
 *  up front, per team, so a failure names the composition rather than surfacing mid-fight. Also
 *  what teams.ts asks before listing a team: one that can't play is left out of the roster.
 *
 *  - the leader needs a no-Intro chain to open on;
 *  - a chain closed by a `.swap()` rather than an outro hands to the next slot's no-Intro chain;
 *  - a swap-form double Intro bounces to the previous slot's no-Intro chain;
 *  - a leader with a double Intro takes the whole team through pre-visits first, which has no
 *    place for a swap-back form;
 *  - a lone outro-form double Intro right after a leader without one has nobody to hand back
 *    to: the leader has already played, so the field would come straight back for a second
 *    Intro off the owner's own outro. Paired with an outro-form double Intro in the third slot
 *    (Hsin and Suoming, Suoming and Jinhsi) the two pre-visits play in turn and it is fine. */
export function teamPlayable(rotations: Rotation[], names: string[]): string | null {
  const openerChain = (i: number): Chain | null => rotations[i]!.openers[0] ?? rotations[i]!.firstOpeners[0] ?? null;
  if (!openerChain(0)) return `${names[0]} leads the team but declares no SWAPIN chain`;
  for (let i = 0; i < rotations.length; i++) {
    const r = rotations[i]!, nxt = (i + 1) % rotations.length;
    const at = slotPosition(rotations, i);
    const visits = [...(at >= 0 ? r.slotIntros[at]! : []), ...r.mains, ...r.firstIntros, ...r.firstOpeners, ...r.openers];
    if (visits.some((c) => c?.exit === SWAP_EXIT) && !openerChain(nxt)) {
      return `${names[nxt]} follows ${names[i]}'s swap-out but declares no SWAPIN chain`;
    }
    const d = r.doubles[0];
    if (!d) continue;
    const prev = (i + rotations.length - 1) % rotations.length;
    if (d.exit === SWAP_EXIT && !openerChain(prev)) return `${names[prev]} plays during ${names[i]}'s double Intro but declares no SWAPIN chain`;
    if (d.exit === SWAP_EXIT && rotations[0]!.doubles.length) return `${names[i]}: a swap-form double Intro can't play in a team whose leader has a double Intro`;
    const third = rotations[2]?.doubles[0];
    if (d.exit !== SWAP_EXIT && i === 1 && !rotations[0]!.doubles.length && !(third && third.exit !== SWAP_EXIT)) {
      return `${names[i]}'s double Intro has nobody to hand back to: ${names[0]} has already played, and ${names[2]} declares no double Intro to pair with`;
    }
  }
  return null;
}

/** Each team's learned visit successors (`State.successor`), by its rotations — the order visits
 *  come in depends on the rotations alone, so every run of the team shares one map. */
const SUCCESSORS = new Map<string, Map<object, { slot: number; visit: object }>>();
const ROTATION_ID = new WeakMap<Rotation, number>();
const rotationsKey = (rotations: Rotation[]): string => rotations.map((r) => {
  let id = ROTATION_ID.get(r);
  if (id === undefined) ROTATION_ID.set(r, (id = ROTATION_ID_NEXT.n++));
  return id;
}).join(",");
const ROTATION_ID_NEXT = { n: 0 };

/** A fight's rotations: each section's rows, the game frame each opens on, where the fight ended, how
 *  many sections closed (all of them but a cut one), and `blind`: a handoff found no successor learned
 *  yet (see `State.successorMissed`) — the caller plays the fight again, every successor now known. */
export interface Fight { sections: Result[][]; starts: number[]; end: number; complete: number; blind: boolean }

export function runRotations(state: State, rotations: Rotation[], count: number, limit = Infinity): Fight {
  // each member presses at their own rotation's delays (run() puts them in effect), the defaults after
  rotations.forEach((r, i) => {
    state.slots[i]!.delays = r.delays;
  });
  state.fightEnd = limit;
  try {
    return playRotations(state, rotations, count, limit);
  } finally {
    useDelays(null);
    state.fightEnd = Infinity;
  }
}

function playRotations(state: State, rotations: Rotation[], count: number, limit: number): Fight {
  const why = teamPlayable(rotations, state.slots.map((s) => s.name));
  if (why) throw new Error(why);
  // Whoever has already played, and so which of the two forms of a chain an arrival takes: the
  // first-arrival ones are the chain a resonator plays the one time they turn up having never
  // acted, whichever entry that arrival uses.
  const visited = new Set<number>();
  // the press member `i` would swap in on now (`swapInPress()` off where they will stand),
  // read as them — the stand evaluate.ts's `checkPress` finds on their press
  const arrivingSwapIn = (i: number): Action | null => {
    const slot = state.slots[i]!, from = state.lastActor;
    let at = from !== i && state.real - slot.endsAt >= DESPAWN_TIME ? null : slot.position;
    if (at === null) at = (from >= 0 && !state.inStart ? state.slots[from]!.position : null) ?? Position.Grounded;
    ctx.state = state;
    const want = swapInPress(slot, at === Position.Midair && !state.inStart ? Position.Midair : Position.Grounded);
    return want && pressOf(want);
  };
  // a slot's own no-Intro chain opening on the press they swap in on: its first-arrival form, else
  // the plain one
  const openerChain = (i: number): Chain | null => {
    const r = rotations[i]!;
    const lists = [!visited.has(i) ? r.firstOpeners : [], r.openers.length ? r.openers : r.firstOpeners];
    if (!lists.some((l) => l.length)) return null;
    const want = arrivingSwapIn(i);
    for (const list of lists) for (const c of list) if (c.swapIn === want) return c;
    // where only one chain could play it stands, and its first press checks what is really cast
    const only = lists.find((l) => l.length)!;
    if (only.length === 1) return only[0]!;
    const listed = [...new Set(lists.flat().map((c) => c.swapIn!.name))];
    throw new Error(`${state.slots[i]!.name} swaps in on ${want?.name ?? "nothing"}, but their rotation has no SWAPIN chain opening on it (only ${listed.join(", ")}) — write one`);
  };
  // the Intro member `i` would arrive on now, read as them — ahead of the Outro that hands it to
  // them where that handoff is still being planned (`handoffPending()`)
  const arrivingIntro = (i: number, pending: boolean): Action => {
    const was = ctx.slot, wasPending = ctx.handoffPending;
    ctx.state = state;
    ctx.slot = state.slots[i]!;
    ctx.handoffPending = pending;
    try {
      return resolving(resolvedIntro);
    } finally {
      ctx.slot = was;
      ctx.handoffPending = wasPending;
    }
  };
  // of the chains a visit may play, the first list holding one that opens on that Intro
  const chainFor = (i: number, pending: boolean, lists: readonly (readonly Chain[])[]): Chain => {
    const intro = arrivingIntro(i, pending);
    for (const list of lists) for (const c of list) if (c.intros!.includes(intro)) return c;
    // read ahead of the swap landing, what they arrive on can still change by the Intro's own row:
    // where only one chain could play it stands, and its row checks what is really cast
    const only = lists.find((l) => l.length);
    if (only?.length === 1) return only[0]!;
    const listed = [...new Set(lists.flat().flatMap((c) => c.intros!.map((a) => a.name)))];
    throw new Error(`${state.slots[i]!.name} arrives on ${intro.name}, but their rotation has no chain opening on it here (only ${listed.join(", ")}) — list it`);
  };
  // ...and its double-Intro pre-visit the same way, undefined where it declares none
  const doubleChain = (i: number): Chain | undefined => {
    const r = rotations[i]!;
    if (!r.doubles.length) return undefined;
    return chainFor(i, false, [!visited.has(i) ? r.firstDoubles : [], r.doubles]);
  };
  const last = state.slots.length - 1;
  // the slot whose own visit ends a trip round the team: the last, unless a double-Intro leader
  // moves it (see that branch below)
  let closer = last;
  const out: Result[][] = [[]];
  // the frame each section opens on: its last member's swap out, where the next opens (see `place()`)
  const starts: number[] = [0];
  let opensAt = 0;
  let section = 0;
  // another visit is due until `count` sections have closed, or the game timer reaches the limit
  const going = (): boolean => section + (closing ? 1 : 0) < count && state.gameOf(Math.max(state.real, state.playsTo)) < limit;
  // the fight ends past the last handoff's swap, where the next Intro would have begun; the hits
  // still in flight land then, in the section that cast them
  const finish = (): Fight => {
    state.plannedGates = null;
    state.handoffWaits = false;
    const blind = state.successorMissed;
    state.successor = null;
    state.lastHandoff = null;
    // Transition at the limit: a section opened at or past it never began, every row cast past it is gone,
    // and a section counts as complete only where its closing handoff came by then
    if (section + (closing ? 1 : 0) < count) {
      const ends = [...starts.slice(1), closing ? opensAt : Infinity];
      while (starts.length > 1 && starts[starts.length - 1]! >= limit) {
        starts.pop();
        out.pop();
        ends.pop();
      }
      for (let k = 0; k < out.length; k++) out[k] = out[k]!.filter((r) => r.starts < limit);
      out.forEach((rows, k) => {
        for (const r of rows) r.section = k;
      });
      return { sections: out, starts, end: limit, complete: ends.filter((at) => at <= limit).length, blind };
    }
    // The fight ends on the last trip's Outro or swap: that row stays, and whatever is still in
    // flight past it never lands.
    let end = 0, endReal = 0, cutoff = 0;
    // a break already draining as the fight ends holds its end back
    const drainUntil = state.drainUntil;
    // the Outro the fight closes on — inside a wait (`fightEnd`) or as the final visit's exit
    let outro = fightEnd;
    if (!outro && finalTo >= 0) {
      const rows = out[section]!, name = state.slots[finalFrom]!.name;
      for (let k = rows.length - 1; k >= 0 && !outro; k--) if (rows[k]!.member === name && isCast(rows[k]!.action, Cast.Outro) && !rows[k]!.queued) outro = rows[k]!;
    }
    if (outro) {
      const rows = out[section]!;
      rows.length = rows.indexOf(outro) + 1;
      cutoff = endReal = outro.realStarts;
    } else {
      // the last member's swap out: its delay is already the swap form's own, and SWAP played
      cutoff = endReal = Math.max(state.real, state.playsTo);
    }
    end = state.gameOf(endReal);
    state.timed = state.timed.filter((h) => h.due <= cutoff);
    // ...and nothing what lands queues past it plays either (Hecate's next attack, say)
    if (state.timed.length || state.behindNext.length) out[section]!.push(...run(state, [], true, cutoff));
    // a break the drain cast can't be swapped out of: the swap, and the fight's end, come after it
    if (drainUntil > endReal && drainUntil < Infinity) {
      endReal = drainUntil;
      end = state.gameOf(endReal);
    }
    out.forEach((rows, k) => {
      for (const r of rows) r.section = k;
    });
    return { sections: out, starts, end, complete: out.length, blind };
  };

  // The section the last slot has just outro'd or swapped out of ends with that visit: `closing`
  // says the next section opens on the next rows placed, the incoming Intro among them.
  let closing = false;
  // How many frames are waiting for the field to come back for a main visit of their own (see
  // `visit()`), and a section-closing trip that finished while one was. The last slot's own outro
  // is what ends a trip round the team, but its visit can run *inside* another slot's wait — the
  // DPS half of a double-Intro pair, whose partner still owes a main visit — and cutting there
  // would leave that partner's own visit to open the next section. So it is held until the wait
  // it ran inside is over.
  let awaiting = 0, closePending = false;
  // the outro the fight's last trip left on, where it closed inside a wait rather than as the
  // final visit (which leaves on no outro at all): the fight ends at its handoff
  let fightEnd: Result | null = null;
  // the fight's last visit left on its Outro: who it hands to (-1 for none), and whose Outro it is
  let finalTo = -1, finalFrom = -1;
  // where a held close's outro sits in its section, and the frame the incoming member was handed
  // the field there
  let pendingAt = -1, pendingOpens = 0;
  // Which slots have had their own visit this trip round the team, and which slot the trip opened
  // on. A double-Intro pair spends its pre-visits *inside* the trip, so the field can come back to
  // a slot that is already done with — it steps over that slot rather than giving it a second
  // visit, and the trip begins again when it reaches the one that opened it.
  const doubled = new Set<number>(), mained = new Set<number>();
  let cycleStart = 0;
  const place = (snaps: Result[]): void => {
    // nothing past the last section: a visit that runs two chains (a double-Intro pre-visit and
    // then its own) can close the final section on the first and still place the second
    if (closing) {
      section++;
      closing = false;
      out.push([]);
      starts.push(opensAt);
    }
    out[section]!.push(...snaps);
  };

  // A `.firstIntro()` chain stands in for the ordinary one until this slot has played at all — the
  // same `visited` the no-Intro pair reads, so a leader's opening visit spends whichever
  // first-arrival chain it enters on rather than leaving the other standing for the next.
  const introChain = (i: number, pending = false): Chain => {
    const r = rotations[i]!, at = slotPosition(rotations, i);
    // the first arrival's, then the chain written for the position this slot stands in, where one
    // opens on the Intro they arrive on
    return chainFor(i, pending, [!visited.has(i) ? r.firstIntros : [], at >= 0 ? r.slotIntros[at]! : [], r.mains]);
  };
  // whether the field arrived on a plain swap rather than an outro: no Intro to cast, so the
  // slot swapped into plays their SWAPIN chain instead (`teamPlayable()` requires one)
  let swapped = false;
  const arrival = (i: number): Chain => {
    if (!swapped) return introChain(i);
    swapped = false;
    const c = openerChain(i);
    if (!c) throw new Error(`${state.slots[i]!.name} is swapped into but declares no SWAPIN chain`);
    return c;
  };

  // a handoff with nothing learned yet times the visit it opens off that visit's own presses — the
  // one it was seen to open, else the slot's usual one
  const planned = (to: number, swap: boolean, visit: object | null = null): VisitGate[] | null => {
    // a learned Intro successor stands only where it opens on the Intro they would arrive on (see `playIntro`)
    const learned = visit as Chain | null;
    const fits = !!learned && (swap || !learned.cast || !!learned.intros?.includes(arrivingIntro(to, true)));
    const chain = (fits ? learned : null) ?? (swap ? openerChain(to) : introChain(to, true));
    if (!chain) return null;
    // a marker reads the fight through the "current" pointers, here as the member arriving, and
    // an Outro handoff's ahead of that Outro (`handoffPending()`), their bars as the visit has
    // banked them by then — put back once read
    const into = state.slots[to]!;
    const resolve = (marker: Action, bars: readonly number[]): Action | null => {
      const was = ctx.slot, energy = into.energy, concerto = into.concerto, forte = [...into.forte];
      ctx.state = state;
      ctx.slot = into;
      ctx.handoffPending = !swap;
      into.energy = bars[0]!;
      into.concerto = bars[1]!;
      for (let i = 0; i < 5; i++) into.forte[i] = bars[2 + i]!;
      try {
        return resolving(marker.resolveFn!) ?? null;
      } finally {
        into.energy = energy;
        into.concerto = concerto;
        for (let i = 0; i < 5; i++) into.forte[i] = forte[i]!;
        ctx.slot = was;
        ctx.handoffPending = false;
      }
    };
    // timed at the arrival's own delays, not the one handing over's
    return atDelays(into.delays, () => chainGates(chain, into, inputActions(into, Input.Intro).length > 0, resolve, [into.energy, into.concerto, ...into.forte], into.resonator?.caps ?? NO_CAPS));
  };
  state.plannedGates = (to, visit) => planned(to, false, visit);
  state.handoffWaits = true;
  if (rotations.some((r) => r.doubles.length)) {
    const key = rotationsKey(rotations);
    let known = SUCCESSORS.get(key);
    if (!known) SUCCESSORS.set(key, (known = new Map()));
    state.successor = known;
  } else state.successor = null;
  state.successorMissed = false;
  const runChain = (i: number, chain: Chain): void => {
    state.active = i;
    // the handoff that brought the field here: which visit really follows that one, and the
    // arrival the gates are learned from, where the Outro's own guess named another slot
    if (state.lastHandoff) {
      if (state.successor && state.lastHandoff.from) state.successor.set(state.lastHandoff.from, { slot: i, visit: chain });
      state.slots[i]!.arrive(state.lastHandoff.from, state.lastHandoff.at);
      state.lastHandoff = null;
    }
    if (!state.slots[i]!.resonator) throw new Error(`${state.slots[i]!.name} outros but has no Resonator equipped`);
    // a DOUBLE_INTRO section's own outro hands the field *backward*, to whoever plays while its
    // owner waits on their main Intro; every other outro advances
    state.outroDir = chain.entry === DOUBLE_ENTRY ? -1 : 1;
    visited.add(i);
    const casts = chain.body;
    // a trip round the team is its members' own visits; a pre-visit is an extra, not one of them
    if (chain.entry !== DOUBLE_ENTRY) { if (!mained.size) cycleStart = i; mained.add(i); }
    // the outro is the one its chain wrote: a kit's Unison form
    // depends on what the visit granted by then
    // a chain leaving on its last cast's `.swap()` has no exit row: the cast already left
    swapped = chain.exit === SWAP_EXIT;
    // the visit that closes the fight leaves on its Outro too, into the incoming Intro the fight
    // ends on (`finish()`); one leaving on a swap ends there
    const closes = i === closer && chain.entry !== DOUBLE_ENTRY && !awaiting;
    const final = closes && section + 1 >= count;
    const exit = swapped ? [] : [chain.exit];
    const list = keepOnForEcho(state.slots[i]!.mainslot, chain.entry === INTRO_ENTRY || chain.entry === DOUBLE_ENTRY ? [chain.cast!, ...casts, ...exit] : [...casts, ...exit]);
    state.slots[i]!.visitChain = chain;
    checkSwapOuts(state.slots[i]!.name, list);
    const snaps = run(state, list);
    state.outroDir = 1;
    // an exit resolver that played a plain swap (no Outro, so no Intro) hands over as a swap form does
    const name = state.slots[i]!.name;
    const resolvedSwap = !swapped && !!chain.exit?.resolveFn && snaps.some((r) => r.member === name && isSwap(r.action) && !r.queued);
    if (resolvedSwap) swapped = true;
    // an Outro row advances the field itself (evaluate.ts); a swap hands it forward here — held
    // first, on the one swapping out, until the incoming visit's cooldown-gated press would land ready
    // the fight's last swap out holds for the next visit's cooldown like every other, so the last
    // rotation ends where the others do
    const next = final && state.successor ? state.successorOf(chain) : null;
    const after = !final ? -1 : state.successor ? next?.slot ?? -1 : (i + 1) % rotations.length;
    if (final && !swapped) {
      finalTo = after;
      finalFrom = i;
    }
    if (final && !exit.length && after >= 0 && state.handoffWaits) {
      const into = state.slots[after]!;
      const from = Math.max(state.real, state.playsTo);
      const short = into.handoffShortfall(chain, state.gameOf(from), planned(after, false, next?.visit ?? null));
      if (short) snaps.push(...run(state, [short.cd.wait(short.frames, short.press)]));
    }
    if (swapped) {
      const to = (i + 1) % rotations.length;
      const seen = state.successor ? state.successorOf(chain) : null;
      const from = Math.max(state.real, state.playsTo);
      const short = !resolvedSwap && (!state.successor || seen?.slot === to) && state.handoffWaits ? state.slots[to]!.handoffShortfall(chain, state.gameOf(from), planned(to, true, seen?.visit ?? null)) : null;
      if (short) snaps.push(...run(state, [short.cd.wait(short.frames, short.press)]));
      // the swap itself, once every wait the one leaving holds for is played (a resolved one already has)
      if (!resolvedSwap) snaps.push(...run(state, [SWAP]));
      const handoff = state.gameOf(Math.max(state.real, state.playsTo));
      state.slots[to]!.swappedInto(Math.max(state.real, state.playsTo));
      state.active = to;
      state.slots[to]!.arrive(chain, handoff);
      state.lastHandoff = { from: chain, at: handoff };
    }
    // A rotation ends as its last member swaps out: the Outro that swap triggers, and everything
    // from it on, opens the next one.
    let at = -1;
    if (closes && !swapped && !final) {
      const name = state.slots[i]!.name;
      for (let k = snaps.length - 1; k >= 0 && at < 0; k--) if (snaps[k]!.member === name && isCast(snaps[k]!.action, Cast.Outro) && !snaps[k]!.queued) at = k;
    }
    if (at >= 0) {
      place(snaps);
      closing = true;
      // the section's time opens where the incoming member was handed the field
      opensAt = state.slots[state.active]!.handoffAt;
      return;
    }
    place(snaps);
    // one full trip round the team is done — the section ends on this outro, and the Intro it
    // hands into opens the next (see `place()`). A double-Intro visit never closes one: its
    // owner's main outro does.
    if (i === closer && chain.entry !== DOUBLE_ENTRY) {
      if (section + 1 >= count && !final && !swapped) {
        const name = state.slots[i]!.name;
        for (let k = snaps.length - 1; k >= 0 && !fightEnd; k--) if (snaps[k]!.member === name && isCast(snaps[k]!.action, Cast.Outro) && !snaps[k]!.queued) fightEnd = snaps[k]!;
      }
      opensAt = state.gameOf(Math.max(state.real, state.playsTo));
      if (awaiting) {
        closePending = true;
        const rows = out[section]!, name = state.slots[i]!.name;
        pendingAt = -1;
        for (let k = rows.length - 1; k >= rows.length - snaps.length && pendingAt < 0; k--) if (rows[k]!.member === name && isCast(rows[k]!.action, Cast.Outro) && !rows[k]!.queued) pendingAt = k;
        pendingOpens = state.slots[state.active]!.handoffAt;
      } else {
        closing = true;
      }
    }
  };

  // the fight's own first seconds — everyone who declares a section for them, in team order, each
  // swapping into the next; the last hands over to slot 1, whose opener starts the rotation cycle
  const starters: number[] = [];
  // the section for the position a slot stands in, else the one for any
  const startOf = (i: number): Action[] | null => {
    const r = rotations[i]!, at = slotPosition(rotations, i);
    return (at >= 0 ? r.startCombat[at] : null) ?? r.startCombat[2]!;
  };
  rotations.forEach((_, i) => { if (startOf(i)) starters.push(i); });
  state.inStart = true;
  for (let k = 0; k < starters.length; k++) {
    const i = starters[k]!;
    const next = starters[k + 1] ?? 0;
    state.active = i;
    state.toOpener = k === starters.length - 1;
    // the section leaves on its own last cast's swap form; with nobody to swap to, the resonator
    // carries straight on and that cast stays on field
    const opening = startOf(i)!;
    const last = opening[opening.length - 1]!;
    checkSwapOuts(state.slots[i]!.name, opening);
    const stays = next === i && leavesField(last);
    // ...a written SWAP its own swap, dropped where nobody is swapped to; a run of echoes, every one
    const tail = trailingRun(opening);
    const kept = last === SWAP ? [] : opening.slice(tail).map(staysOnField);
    const chain = stays ? [...opening.slice(0, tail), ...kept] : leavesField(last) && last !== SWAP ? [...opening, SWAP] : opening;
    out[section]!.push(...run(state, chain));
    if (!stays) state.slots[next]!.swappedInto(Math.max(state.real, state.playsTo));
    state.active = next;
  }
  state.inStart = false;
  state.toOpener = false;

  const opener = openerChain(0)!;
  runChain(0, opener);

  // Whose double-Intro pre-visit has already run this cycle — set when it plays, cleared by the
  // owner's own main-Intro visit, so the next cycle round runs it again. `mained` is the same for
  // the main visit, and only ever read by the frame that just handed the field away (see below).
  // Which slot a pre-visit just handed the field back to, for the visit it hands into: what that
  // visit owes the field back to in turn, if it has a pre-visit of its own (Suoming behind a
  // double-Intro DPS — his pre-visit hands to her, hers hands straight back to him).
  let handedBack: number | null = null;
  const visit = (i: number): void => {
    const from = handedBack;
    handedBack = null;
    // A double-Intro pre-visit fires on the arrival *before* its owner: the outro that landed
    // here was really theirs. Swap form: their Intro and section casts, a plain swap back, and
    // this slot's SWAPIN chain fills the field until its own outro hands forward for the main
    // Intro. Outro form: their section leaves on a real outro back here, and this slot plays its
    // whole normal visit in between instead.
    const nxt = (i + 1) % rotations.length;
    // Already played this trip: the field passes straight through — its partner in a double-Intro
    // pair is still owed a visit and is who it is really on its way to. Back at the slot the trip
    // opened on with every other slot played, the trip is over and the next one starts here.
    if (mained.has(i)) {
      if (i !== cycleStart || mained.size < rotations.length) { state.active = nxt; return; }
      mained.clear();
    }
    // Who this visit owes the field back to, if it turns out to be a pre-visit of its own: the
    // previous slot, whose forward outro is the ordinary way the field arrives here — or the
    // *next* slot instead, when what arrived was their own pre-visit's backward hand.
    let giver = from ?? (i + rotations.length - 1) % rotations.length;
    // A slot still owing an outro-form pre-visit this trip round.
    const preVisitDue = (at: number): boolean =>
      !mained.has(at) && !doubled.has(at) && !!rotations[at]!.doubles.length && rotations[at]!.doubles[0]!.exit !== SWAP_EXIT;
    // Both halves of a pair owe one: they fire in team order, this slot's first (see the `own`
    // block below, which hands the field *forward* to the partner rather than back the way it
    // came). The look-ahead stands down for it — the partner runs theirs on their own arrival.
    const paired = !!mained.size && preVisitDue(i) && preVisitDue(nxt);
    // Pre-visits belong behind the trip's own opening visit — a fresh trip plays that first, and
    // only then does the pair fire. A lone one still fires from the slot ahead (a 3rd member's
    // pre-visit hands to the 2nd, whose whole visit runs before the 3rd's main Intro).
    const d = mained.size && !mained.has(nxt) && !paired ? doubleChain(nxt) : undefined;
    if (d && !doubled.has(nxt)) {
      doubled.add(nxt);
      if (d.exit !== SWAP_EXIT) {
        runChain(nxt, d); // its outro hands straight back here; fall through to the normal visit
        giver = nxt;
      } else {
        state.active = nxt;
        // the section's last cast leaves on its `.swap()`, back to the slot it came from
        state.outroDir = -1;
        const body = keepOnForEcho(state.slots[nxt]!.mainslot, [d.cast!, ...d.body]);
        checkSwapOuts(state.slots[nxt]!.name, body);
        place(run(state, [...body, SWAP]));
        state.outroDir = 1;
        state.slots[i]!.swappedInto(Math.max(state.real, state.playsTo));
        state.active = i;
        runChain(i, openerChain(i)!); // the SWAPIN fill; its outro hands forward
        return;
      }
    }
    // A pre-visit of this slot's own, still to play — either arrived at directly (the first cycle,
    // before anyone has arrived *before* them: Jinhsi leading off slot 2 behind a Suoming who
    // answers her Unison outro), or handed the field by the pre-visit just run above, which is
    // Suoming's own shape: the slot behind her opens, she leaves on her Unison outro straight
    // back to them, and their whole visit runs before her main Intro below. Outro form only.
    const own = mained.size ? doubleChain(i) : undefined;
    let waited = false;
    if (own && own.exit !== SWAP_EXIT && !doubled.has(i)) {
      doubled.add(i);
      runChain(i, own);
      // ...and the field goes to whoever plays while this slot waits: the partner ahead when they
      // owe a pre-visit of their own, since the pair fires in team order and theirs is next, else
      // back the way it came. Either way it works its way round to this slot again — which is when
      // the main Intro below is due. The giver's own visit may bring it straight back (the
      // ordinary Jinhsi shape) or hand it on around the rest of the team first; this waits for it
      // rather than assuming.
      handedBack = i;
      state.active = paired ? nxt : giver;
      mained.delete(i);
      awaiting++;
      waited = true;
      while (state.active !== i && !mained.has(i) && going()) visit(state.active);
      awaiting--;
      // the trip round played this slot's own main visit on the way (a DPS whose pre-visit hands
      // to a sub-DPS: hers hands straight back, and his main visit runs inside her wait) — there
      // is no second one to play
      if (mained.has(i)) { closeIfPending(); return; }
    }
    doubled.delete(i);
    runChain(i, arrival(i));
    if (waited) closeIfPending();
  };

  /** The trip that ended inside this slot's own wait ends here instead, now that its main visit
   *  has run — the next section opens on whoever intros next, as it would have anyway. */
  function closeIfPending(): void {
    if (awaiting || !closePending) return;
    closePending = false;
    closing = true;
    // the next section opens where the field was handed on, as an unheld close's does
    if (pendingAt >= 0) opensAt = pendingOpens;
  }

  // A leader with a double Intro of their own: pre-visits in team order, a slot without one playing
  // its whole visit in its place, then the main visits in team order (see the header). The trip
  // ends on the last of those. Outro-form sections only — a swap-back form leans on the previous
  // slot's SWAPIN fill, which this shape has no place for.
  if (rotations[0]!.doubles.length) {
    closer = rotations.reduce((at, r, i) => (r.doubles.length ? i : at), 0);
    let first = true, trips = 0;
    while (going()) {
      if (++trips > 1000) throw new Error("rotation scheduler never closed its sections");
      // the opener already stood in for the leader's first pre-visit
      for (let i = first ? 1 : 0; i < rotations.length && going(); i++) runChain(i, doubleChain(i) ?? arrival(i));
      first = false;
      for (let i = 0; i < rotations.length && going(); i++) {
        if (rotations[i]!.doubles.length) runChain(i, arrival(i));
      }
    }
    return finish();
  }

  let guard = 0;
  while (going()) {
    if (++guard > 1000) throw new Error("rotation scheduler never closed its sections");
    visit(state.active);
  }
  return finish();
}
