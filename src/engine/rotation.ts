/**
 * Rotations, and the scheduler that decides whose turn it is.
 *
 * A resonator's rotation is not a flat list of casts — it's up to three *action chains*, one per
 * way of arriving on field, and a kit writes all three as a single array that `Rotation`'s
 * constructor splits apart:
 *
 *   new Rotation([
 *     START_LAST, Skill.swap(),                             // the fight's own first seconds
 *     NOINTRO, BA1, BA2, GeopotentialShift,                  // leading the team, with no Intro to cast
 *     INTRO, Liberation, WBA1, WBA2, ECHO.swap(), OUTRO, // every visit after
 *   ])
 *
 * The NOINTRO chain runs *through* the INTRO marker without casting it and carries on into the same
 * tail, so the body a resonator repeats is written once — the opener is that body plus whatever
 * prefix it declares, minus the Intro nobody could have handed them at the start of a fight. Give
 * the opener its own OUTRO before the INTRO instead and the two stop sharing, for a kit whose
 * opener genuinely isn't its loop. A NOINTRO chain that runs into a DOUBLE_INTRO section shares
 * *that* instead: leading, the opener is the prefix and then the pre-visit's casts and outro.
 *
 * Markers are `Action`s so a kit can keep writing one plain array, but none of them is a cast:
 * INTRO and the three ECHO_* markers stand for one and resolve through `Action.resolve` at run
 * time, and the rest are read by the compiler here and never reach `evaluate()`. A resonator
 * leaves the field on an OUTRO or on a cast's swap form (`.swapCancel()`, `.instaSwap()`), which the
 * scheduler follows with SWAP unless an Outro comes next; there is no bare swap to write.
 */
import { Gear } from "./gear.js";
import { run } from "./evaluate.js";
import { currentMember, isCast } from "./context.js";
import { ctx, resolving } from "./runtime.js";
import type { GearDef, Mainslot } from "./gear.js";
import type { State, TeamMember, VisitGate } from "./state.js";
import type { Result } from "./evaluate.js";
import { Cast, CAST_NAME, ActionTag, INSTA_DELAY, MASH_DELAY, HOLD_DELAY, CANCEL_DELAY, SWAP_DELAY, FULL_CONCERTO, Position, splitStop } from "./stats.js";
import type { Attribute, Type, Subtype, Node, Scaling } from "./stats.js";

/* ------------------------------------------------------------------------------- the action */

export interface ActionDef extends GearDef {
  /** What every hit that names none of its own deals as — the action itself has no tags. */
  element?: Attribute | null;
  type?: Type | null;
  subtype?: Subtype | null;
  cast?: Cast | null;
  subcast?: Cast | null;
  node?: Node | null;
  scaling?: Scaling | null;
  /** What the *cast* banks, the moment it is pressed: a spend (an outro's -100 Concerto, a forte
   *  drain), and the flat regen a kit grants on the press rather than on a landed hit. A hit's own
   *  gains are its bullet's, so a press whose hit lands later (an outro, an insta swap, a summon)
   *  or never (an insta cut) still pays its cast share then. evaluate() banks both. A cast runs no
   *  stat, so its energy is flat: neither ER nor the Energy Regen Multiplier scales it. */
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
  /** Marks the actual button-press Liberation cast that spends the Energy bar — used only to
   *  reset RealEnergy (see `TeamMember.realEnergy`) back to 0 once it fires. Never set on a
   *  Liberation-tagged follow-up that doesn't itself cost the bar, or on a kit whose Liberation
   *  costs no Resonance Energy at all (`maxEnergy: 0`). */
  resetEnergy?: boolean;
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
  /** The cast's condition on its owner's bars as it is cast — at least `minX`, at most `maxX`
   *  (Iuno's Absolute Fullness `minConcerto: 100`, Hsin's Stilling All Horizons `maxForte2: 0`).
   *  What a cast spends is no condition of its own. A row cast outside one reads red, and a hold
   *  cancel holds until the next press's are met (`Action.holdPaid()`). */
  minEnergy?: number;
  maxEnergy?: number;
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
  /** The cast's condition on held buffs: every one must stand on its owner, the team or the target
   *  as it is cast (a stance a press only exists in). Reads red and warns like `minX`. */
  requireBuff?: Gear | Gear[];
  /** The opposite: none of these may stand on its owner, the team or the target as it is cast (a
   *  base form a stance replaces). Reads red, warns, and holds a hold cancel the same way. */
  forbidBuff?: Gear | Gear[];
  /** The presses this one may follow, any form of them (DODGE/JUMP/INTRO/ECHO: any press of that
   *  cast), else it throws; unset, anything. A function where one is declared after it. */
  chains?: readonly Action[] | (() => readonly Action[]);
  /** It doesn't break its owner's chain: the press before it is saved (`saveChain()`) for the next
   *  to follow — a summon echo. */
  keepsChain?: boolean;
  /** Where its owner must stand to cast it; unset, anywhere. A press cast elsewhere throws. */
  castPosition?: Position;
  /** Where it leaves its owner; unset, where they stood. */
  endPosition?: Position;
  /** A rotation marker rather than a real cast: `run()` calls this to get whichever action to
   *  actually evaluate in its place, with the "current" pointers already aimed at the acting slot
   *  (so it can read `currentMember()` etc. the same as any other kit logic). Every marker below
   *  that stands for a real cast — INTRO, the ECHO_* markers — is built on this, which
   *  is why the engine knows nothing about any of them by name. `null` means the marker resolved
   *  to no cast at all this step (it deferred itself onto a later one, say — see `queueOnIntro()`),
   *  and `run()` simply moves on. */
  resolve?: () => Action | null;
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
  /** The one tag this action carries: how it is cut short, or that it plays beside the fight
   *  (`OffField`). `Default` unless it says otherwise. */
  tag?: ActionTag;
  /** A wait on the game timer (`Cooldown.wait()`): `animFrames` are game frames, and it plays
   *  however many real ones that takes, time stop landing inside it included. */
  gameWait?: boolean;
}

export { ActionTag };

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

/** A press's frames as the clock charges them: the action up to its cut (its whole length when
 *  it runs out; `cutFrame`, or an on-hit cut's first hit), less the world's time stop inside that,
 *  plus the delay its cut runs on past that point — `CANCEL_DELAY` for a plain, dodge, jump or on-hit
 *  cancel or swap cancel, `INSTA_DELAY` for an insta one (an insta swap too); a mash swap lets go
 *  `MASH_DELAY` after its no-swap frames, and plays no delay past that. A hold or mash cancel
 *  lets go where the next press can pay (`holdAt()`), `HOLD_DELAY` / `MASH_DELAY` at the least. An insta cut
 *  is made on the press and a field press lands beside the fight, so neither plays any of its own. */
export function cancelCost(a: Action, cut: ActionTag | null): { action: number; timestop: number; global: number; total: number } {
  const full = a.animFrames;
  const tag = cut ?? a.tag;
  const insta = tag === ActionTag.InstaCancel || tag === ActionTag.InstaDodge || tag === ActionTag.InstaJump || tag === ActionTag.InstaSwap;
  // a cut plays to its cut frame in place of its frames, never past its end — the whole press's,
  // a part holding none of its bullets
  const whole = a.half === "cast" ? a.formOf ?? a : a;
  // an Outro is cast on the way off, and plays its animation behind the incoming Intro
  const action = tag === ActionTag.OffField || insta || a.cast === Cast.Outro ? 0 : tag === ActionTag.Default ? full
    : tag === ActionTag.HoldCancel ? Math.min(HOLD_DELAY, full)
    : tag === ActionTag.MashCancel ? Math.min(MASH_DELAY, full)
    : tag === ActionTag.MashSwap ? Math.min(whole.noSwapFrames + MASH_DELAY, full)
    : Math.min(whole.onHitAt ?? whole.cutFrame, full);
  // a swap's delay runs on past its cut like any other cancel's: an insta one's, else a cancel's
  const global = insta ? INSTA_DELAY
    : tag === ActionTag.Cancel || tag === ActionTag.DodgeCancel || tag === ActionTag.JumpCancel || tag === ActionTag.SwapCancel
      || tag === ActionTag.HitCancel || tag === ActionTag.DodgeOnHit || tag === ActionTag.JumpOnHit ? CANCEL_DELAY : 0;
  const timestop = splitStop(a.timestopFrom, a.timestop, action, action + global).own;
  return { action, timestop, global, total: action - timestop + global };
}

/** A bar after `delta` banks on it, the way evaluate() banks one — `k` 0 energy and 1 concerto,
 *  which a gain never leaves below empty (and a concerto spend takes from its 100 ceiling); 2-6 a
 *  forte gauge, which a reset or a red bar taking a gain (or any cast) empties first, a spend
 *  starting from its cap. A reset empties energy the same way. */
export function bankBar(k: number, g: number, delta: number, reset: boolean, cast: boolean, cap: readonly number[]): number {
  if (k === 0) return Math.max(0, (reset ? 0 : g) + delta);
  if (k === 1) return delta < 0 ? Math.min(g, FULL_CONCERTO) + delta : Math.max(0, g + delta);
  const max = cap[k - 2]!;
  if (reset || (g < 0 && (delta > 0 || cast))) g = 0;
  if (max > 0 && delta < 0 && g > max) g = max;
  return g + delta;
}

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
  cast: Cast | null;
  subcast: Cast | null;
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
  resetEnergy: boolean;
  /** The cast's condition (`ActionDef.minEnergy` and on), bar by bar — energy, concerto, forte 1-5 —
   *  or null where it has none. */
  castMin: number[] | null;
  castMax: number[] | null;
  /** `ActionDef.requireBuff`, as a list, or null where it has none. */
  requireBuffs: Gear[] | null;
  /** `ActionDef.forbidBuff`, as a list, or null where it has none. */
  forbidBuffs: Gear[] | null;
  /** `ActionDef.chains` as written, read by `follows()`; null where it follows anything. */
  private readonly chainsDef: readonly Action[] | (() => readonly Action[]) | null;
  /** `ActionDef.castPosition` / `endPosition`, null where unset, and `keepsChain`. */
  castPosition: Position | null;
  endPosition: Position | null;
  keepsChain: boolean;
  /** `resetForte1`-`resetForte5` as one array, indexed the way `TeamMember.forte` is. */
  resetForte: [boolean, boolean, boolean, boolean, boolean];
  /** Per bar — energy, concerto, forte 1-5 — what the cast banks of its own and whether it empties
   *  the bar first, and every bullet's gain there, seven a bullet in bullet order. */
  readonly castGains: readonly number[];
  readonly resetBars: readonly boolean[];
  readonly bulletGains: readonly number[];
  resolveFn?: () => Action | null;
  animFrames: number;
  /** `ActionDef.animPriority` as [frame, tier] windows, in frame order; empty where it has none. */
  animPriority: readonly (readonly [number, number])[];
  castPriority: number | null;
  noSwapFrames: number;
  qteFrames: number;
  /** Where an on-hit cut cuts (its first bullet's hit); null on every other press. Engine-owned. */
  onHitAt: number | null = null;
  /** The stops' lengths, and the animation frame each starts on (`ActionDef.timestop`/`motionStop`). */
  timestop: number;
  timestopFrom: number;
  motionStop: number;
  motionStopFrom: number;
  cooldown: Cooldown | null;
  cooldownFrames: number;
  gameWait: boolean;
  tag: ActionTag;
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
    this.cast = def.cast ?? null;
    this.subcast = def.subcast ?? null;
    this.node = def.node ?? null;
    this.scaling = def.scaling ?? null;
    this.animFrames = def.animFrames ?? 0;
    // a kit's def is often typed loosely, so a stale key would be dropped without a word
    if ("prioFrames" in def) throw new Error(`${name}: prioFrames is gone — declare animPriority and castPriority`);
    this.animPriority = Object.entries(def.animPriority ?? {}).map(([f, t]) => [Number(f), t] as const).sort((a, b) => a[0] - b[0]);
    this.castPriority = def.castPriority ?? null;
    this.noSwapFrames = def.noSwapFrames ?? 0;
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
    this.resetEnergy = def.resetEnergy ?? false;
    const min = [def.minEnergy, def.minConcerto, def.minForte1, def.minForte2, def.minForte3, def.minForte4, def.minForte5];
    const max = [def.maxEnergy, def.maxConcerto, def.maxForte1, def.maxForte2, def.maxForte3, def.maxForte4, def.maxForte5];
    this.castMin = min.some((v) => v !== undefined) ? min.map((v) => v ?? -Infinity) : null;
    this.castMax = max.some((v) => v !== undefined) ? max.map((v) => v ?? Infinity) : null;
    const req = def.requireBuff;
    this.requireBuffs = req === undefined ? null : Array.isArray(req) ? (req.length ? req : null) : [req];
    const forbid = def.forbidBuff;
    this.forbidBuffs = forbid === undefined ? null : Array.isArray(forbid) ? (forbid.length ? forbid : null) : [forbid];
    this.chainsDef = def.chains ?? null;
    this.castPosition = def.castPosition ?? null;
    this.endPosition = def.endPosition ?? null;
    this.keepsChain = def.keepsChain ?? false;
    this.castForte = [def.castForte1 ?? 0, def.castForte2 ?? 0, def.castForte3 ?? 0, def.castForte4 ?? 0, def.castForte5 ?? 0];
    const banks = [this.castEnergy, this.castConcerto, ...this.castForte, this.castOfftune];
    for (const h of this.bullets) {
      const own = [h.energy, h.concerto, h.forte1, h.forte2, h.forte3, h.forte4, h.forte5, h.offtune];
      for (let k = 0; k < banks.length; k++) banks[k] = banks[k]! + own[k]!;
    }
    this.banks = banks;
    this.resetForte = [!!def.resetForte1, !!def.resetForte2, !!def.resetForte3, !!def.resetForte4, !!def.resetForte5];
    this.castGains = [this.castEnergy, this.castConcerto, ...this.castForte];
    this.resetBars = [this.resetEnergy, false, ...this.resetForte];
    this.bulletGains = this.bullets.flatMap((h) => [h.energy, h.concerto, h.forte1, h.forte2, h.forte3, h.forte4, h.forte5]);
    this.resolveFn = def.resolve;
    // a kit's def is often typed loosely (`def: object`), so a bare number gets this far
    if (typeof def.timestop === "number" || typeof def.motionStop === "number") throw new Error(`${name}: timestop/motionStop are [start, end) ranges`);
    const [ts0, ts1] = def.timestop ?? [0, 0], [ms0, ms1] = def.motionStop ?? [0, 0];
    if (ts1 < ts0 || ms1 < ms0) throw new Error(`${name}: a stop's range ends before it starts`);
    this.timestopFrom = ts0;
    this.timestop = ts1 - ts0;
    this.motionStopFrom = ms0;
    this.motionStop = ms1 - ms0;
    this.tag = def.tag ?? ActionTag.Default;
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
    return this.tag === ActionTag.OffField || this.cast === Cast.Outro ? null : this.castPriority;
  }
  /** Does this press follow `prev`, its owner's last press of the visit (null: none yet) — any form
   *  of a press its `chains` names, or any press of a marker's cast (`ActionDef.chains`)? */
  follows(prev: Action | null): boolean {
    if (!this.chainsDef) return true;
    if (!prev) return false;
    const list = typeof this.chainsDef === "function" ? this.chainsDef() : this.chainsDef;
    for (const entry of list) {
      const cast = castMarkers().get(entry);
      for (let a: Action | null = prev; a; a = a.cancelOf ?? a.formOf) {
        if (cast !== undefined ? a.cast === cast : a === entry) return true;
      }
    }
    return false;
  }
  /** Does it name presses it must follow (`chains`)? */
  get chained(): boolean { return this.chainsDef !== null; }
  /** `chains` as names, for an error naming what a press may follow. */
  chainNames(): string[] {
    if (!this.chainsDef) return [];
    const list = typeof this.chainsDef === "function" ? this.chainsDef() : this.chainsDef;
    return list.map((a) => {
      const cast = castMarkers().get(a);
      return cast !== undefined ? `any ${CAST_NAME[cast]}` : a.name;
    });
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
  cost(cut: ActionTag | null): ReturnType<typeof cancelCost> {
    let out = this.costs?.get(cut);
    if (!out) (this.costs ??= new Map()).set(cut, (out = cancelCost(this, cut)));
    return out;
  }
  /** Does cutting this echo by `kind` — its dash after included, for a dash cut — free its wearer
   *  sooner than pressing it whole? Where it doesn't, the echo plays whole and drops the dash. */
  cutPays(kind: ActionTag): boolean {
    const c = this.cost(kind);
    const jump = kind === ActionTag.JumpCancel || kind === ActionTag.InstaJump || kind === ActionTag.JumpOnHit;
    const dashes = jump || kind === ActionTag.DodgeCancel || kind === ActionTag.InstaDodge || kind === ActionTag.DodgeOnHit;
    return c.action + c.global + (dashes ? dashFor(jump, this).animFrames : 0) < this.animFrames;
  }
  /** `cost()` by cut, made once: an action's frames never change once built. */
  private costs?: Map<ActionTag | null, ReturnType<typeof cancelCost>>;
  /** What the clock charges this press let go at animation frame `frame` by a hold cancel. */
  holdCost(frame: number): ReturnType<typeof cancelCost> {
    const timestop = splitStop(this.timestopFrom, this.timestop, frame, frame).own;
    return { action: frame, timestop, global: 0, total: frame - timestop };
  }
  /** What this cast banks on each bar — energy, concerto, forte 1-5 — its bullets' aside. */
  castBars(): readonly number[] {
    return this.castGains;
  }
  /** Which of `bars` (energy, concerto, forte 1-5, as the cast finds them) fall outside this cast's
   *  condition (`ActionDef.minEnergy` and on) — a forte gauge left below empty reading as empty —
   *  or null where it has none or every one is met. */
  castUnmet(bars: readonly number[]): boolean[] | null {
    if (!this.castMin && !this.castMax) return null;
    const out = bars.map((v, k) => {
      const at = k >= 2 ? Math.max(0, v) : v;
      return at < (this.castMin?.[k] ?? -Infinity) - 1e-9 || at > (this.castMax?.[k] ?? Infinity) + 1e-9;
    });
    return out.some(Boolean) ? out : null;
  }
  /** Which of this cast's `requireBuff` buffs neither `owner`, the team nor the target holds, or
   *  null where it has none or every one stands. */
  buffsUnmet(state: State, owner: TeamMember): Gear[] | null {
    if (!this.requireBuffs) return null;
    const out = this.requireBuffs.filter((g) => !owner.isHeld(g) && !state.globalStacks.has(g) && !state.enemyStacks.has(g));
    return out.length ? out : null;
  }
  /** Which of this cast's `forbidBuff` buffs `owner`, the team or the target holds, or null where it
   *  has none or none stands. */
  buffsForbidden(state: State, owner: TeamMember): Gear[] | null {
    if (!this.forbidBuffs) return null;
    const out = this.forbidBuffs.filter((g) => owner.isHeld(g) || state.globalStacks.has(g) || state.enemyStacks.has(g));
    return out.length ? out : null;
  }
  /** The animation frame a hold cancel of this press has its owner's `bars` (energy, concerto,
   *  forte 1-5, before its cast) meeting `next`'s cast condition: 0 where they do on the cast's own
   *  gain (`castGain` what its hooks added, the same way round) or `next` has none, else the bullet
   *  that brings them there — its last bullet where none does, after which nothing of it moves them.
   *  `pending` are hits already on the clock for its owner (an earlier press's committed bullets),
   *  `at` frames after this cast: they bank in among its own. */
  holdPaid(bars: readonly number[], cap: readonly number[], next: Action | null, castGain: readonly number[] | null = null,
    pending: readonly { at: number; bullet: Bullet }[] = []): number {
    if (!next || (!next.castMin && !next.castMax)) return 0;
    const cast = this.castGains, reset = this.resetBars;
    const g = bars.map((v, k) => bankBar(k, v, cast[k]! + (castGain?.[k] ?? 0), reset[k]!, this.cast !== null, cap));
    if (!next.castUnmet(g)) return 0;
    let last = this.bullets.length ? 0 : this.animFrames;
    const hits = [...this.bullets.map((bullet) => ({ at: bullet.hitFrame, bullet, own: true })), ...pending.map((p) => ({ ...p, own: false }))];
    for (const { at, bullet: b, own } of hits.sort((x, y) => x.at - y.at)) {
      if (at >= this.animFrames && !own) continue;
      for (let k = 0; k < 7; k++) g[k] = bankBar(k, g[k]!, barGain(b, k), false, false, cap);
      if (!next.castUnmet(g)) return Math.min(at, this.animFrames);
      if (own) last = at;
    }
    return Math.min(last, this.animFrames);
  }
  /** The first frame from `from` on where `next` can follow this press: where `next`'s priority beats
   *  this one's, and — for a `mash` into an Outro, the one cut that waits for them — past its no-swap
   *  frames. */
  freeForNext(next: Action | null, from = 0, mash = false): number {
    const swaps = mash && next?.cast === Cast.Outro;
    return this.freeFor(next?.cutIn ?? null, swaps ? Math.max(from, this.noSwapFrames) : from);
  }
  /** Where a hold (or `mash`) cancel paid at `paid` (`holdPaid()`) lets go. A hold lets go the frame
   *  `next` can follow it — the bars paid and its window open (`freeForNext()`) — never inside
   *  `HOLD_DELAY`; a mash, its input landing only on the next tap, `MASH_DELAY` after that frame,
   *  whatever held it or nothing. Its press's end where `next` never can — a cut the engine then
   *  refuses (`checkHoldCut()`). */
  letGo(paid: number, mash = false, next: Action | null = null): number {
    const at = mash ? this.freeForNext(next, paid, true) + MASH_DELAY : this.freeForNext(next, Math.max(HOLD_DELAY, paid));
    return Math.min(at, this.animFrames);
  }
  /** `letGo()` of `holdPaid()`: where a hold (or `mash`) cancel of this press lets go. */
  holdAt(bars: readonly number[], cap: readonly number[], next: Action | null, castGain: readonly number[] | null = null,
    pending: readonly { at: number; bullet: Bullet }[] = [], mash = false): number {
    return this.letGo(this.holdPaid(bars, cap, next, castGain, pending), mash, next);
  }
  /** Does this take its owner off the field — what "lost on swap" reads: an Outro or the SWAP
   *  marker after a swap form, never the swap form itself. An OFF_FIELD press (a summon, a
   *  coordinated hit) lands beside the fight but moves nobody. */
  get swapOut(): boolean { return this.cast === Cast.Outro || this === SWAP; }

  /** The same cast again under `overrides` — every hook and number shared, but a new Action, so
   *  the two are told apart by identity wherever it matters (a Mainslot's off-field copy of its
   *  own hit, say). */
  variant(name: string, overrides: ActionDef): Action {
    return new Action(name, { ...this.def, ...overrides });
  }

  /** This cast cut at its cancel frame — its hit lands, and the clock charges `cancelCost()`.
   *  The same Action runs, so every `===` a kit makes against it still holds. */
  cancel(): Action { return new CancelledStep(this, ActionTag.Cancel); }
  /** This press every other time its member reaches one, skipped in between (`EveryOther`). */
  everyOther(): Action {
    if (leavesField(this)) throw new Error(`${this.name}: a swap form can't be skipped — the visit would no longer leave on it`);
    return new EveryOther(this);
  }
  /** The same, the next press mashed in: a hold cancel (`holdAt()`) whose least is `MASH_DELAY`. */
  mashCancel(): Action { return new CancelledStep(this, ActionTag.MashCancel); }
  /** The same, held into the next press: let go the moment the bars pay for it (`holdAt()`). */
  holdCancel(): Action { return new CancelledStep(this, ActionTag.HoldCancel); }
  /** The same, cut by a dash: a group of this press and the dash after it (`dashed()`). */
  dodgeCancel(): Action { return dashed(this, ActionTag.DodgeCancel); }
  /** The same, cut by a jump. */
  jumpCancel(): Action { return dashed(this, ActionTag.JumpCancel); }

  /** This cast cancelled the moment it is pressed — its own effects (the hooks, the cast tags) with
   *  none of its hit: no motion value, element, types, scaling, or energy/concerto/off-tune/forte. */
  instaCancel(): Action { return this.instaForm(ActionTag.InstaCancel); }
  /** The same, the press cut by a dash, which follows it (`dashed()`). */
  instaDodge(): Action { return dashed(this, ActionTag.InstaDodge); }
  /** The same, the press cut by a jump. */
  instaJump(): Action { return dashed(this, ActionTag.InstaJump); }

  /** The insta forms, pointed back at the cast they cancel so `runningAction()` still reads the two
   *  as one: the cast's own effects and the bullets committed inside `INSTA_DELAY`. */
  instaForm(kind: ActionTag): Action {
    // a marker has no hit of its own to strip yet: the step carries the cut to whatever it resolves to
    if (this.resolveFn) return new CancelledStep(this, kind);
    return this.hitless(kind);
  }
  private hitlessForms?: Map<ActionTag, Action>;
  /** The copy an insta cut plays, one per kind. */
  private hitless(kind: ActionTag): Action {
    const seen = this.hitlessForms?.get(kind);
    if (seen) return seen;
    // only the bullets committed inside the insta cut's delay land
    const kept = this.bullets.filter((h) => h.commitFrame <= INSTA_DELAY);
    // every hit lost, the cast's own banking stands
    const out = kept.length === this.bullets.length ? this.variant(this.name, { tag: kind }) : this.variant(this.name, { tag: kind, bullets: kept });
    out.cancelOf = this;
    // an insta cut that lost every hit is its cast alone
    if (!kept.length && this.bullets.length) out.half = "cast";
    (this.hitlessForms ??= new Map()).set(kind, out);
    return out;
  }

  /** Does this press queue its hits and its end: any press that takes time, and always an Outro's or
   *  an insta swap's (its hits land after the swap). One taking no time plays whole. */
  splitsHit(cut: ActionTag | null): boolean {
    if (this.half !== null) return false;
    if (!this.bullets.length) return !this.castsInstantly && this.cost(cut).total > 0;
    if (this.cast === Cast.Outro || this.tag === ActionTag.InstaSwap || this.bullets.length > 1) return true;
    return this.hitDelay(0) > 0 || (!this.castsInstantly && this.cost(cut).total > 0);
  }
  /** Do the queued hits land with their owner off the field — an Outro's. A swap form's land
   *  wherever the field stands by then (its SWAP may come first), a summon's the same. */
  hitsAway(_cut: ActionTag | null): boolean {
    return this.cast === Cast.Outro;
  }
  /** Does the cast take none of the clock — an Outro, an OFF_FIELD hit (its frames are only the time its
   *  hits take). */
  get castsInstantly(): boolean {
    return this.cast === Cast.Outro || this.tag === ActionTag.OffField;
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
      const instant = this.castsInstantly ? { animFrames: 0, animPriority: undefined, noSwapFrames: 0, timestop: undefined } : {};
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
        animFrames: 0, animPriority: undefined, noSwapFrames: 0, timestop: undefined, motionStop: undefined, cooldown: undefined,
        castEnergy: 0, castConcerto: 0, castOfftune: 0, castForte1: 0, castForte2: 0, castForte3: 0, castForte4: 0, castForte5: 0,
        resetEnergy: false, resetForte1: false, resetForte2: false, resetForte3: false, resetForte4: false, resetForte5: false,
        // the swap was the cast's; the hit is no cut of its own
        tag: this.tag === ActionTag.OffField ? ActionTag.OffField : ActionTag.Default,
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
        animFrames: 0, animPriority: undefined, noSwapFrames: 0, timestop: undefined, motionStop: undefined, cooldown: undefined,
        castEnergy: 0, castConcerto: 0, castOfftune: 0, castForte1: 0, castForte2: 0, castForte3: 0, castForte4: 0, castForte5: 0,
        resetEnergy: false, resetForte1: false, resetForte2: false, resetForte3: false, resetForte4: false, resetForte5: false,
        tag: this.tag === ActionTag.OffField ? ActionTag.OffField : ActionTag.Default,
      });
      this.endCopy.formOf = this;
      this.endCopy.half = "end";
    }
    return this.endCopy;
  }

  /** This press as a step's `kind` plays it: an insta cut is its insta form, which carries the
   *  cut itself; any other cut is this press, cut. */
  cutAs(kind: ActionTag | null): [Action, ActionTag | null] {
    // an action has one tag: a swap, an outro or a field hit can't be cut as well
    if (kind && this.tag !== ActionTag.Default) throw new Error(`${this.name}: already ${this.tag}, can't also be ${kind}`);
    if (kind === ActionTag.InstaCancel || kind === ActionTag.InstaDodge || kind === ActionTag.InstaJump) return [this.hitless(kind), null];
    return [this, kind];
  }


  /** The follow-up hit of a multi-hit coordinated attack — the same hit under the same name,
   *  but inside the lead's ICD, so it carries none of the lead's grants (no `updateBuffs`). */
  paired(): Action {
    return this.variant(this.name, { updateBuffs: undefined });
  }

  /** The press cut `CANCEL_DELAY` after its first bullet hits, the bullets committed by the end of
   *  that delay landing: CANCEL ON HIT. Only for a press whose bullets hit on more than one frame, like the two below. */
  hitCancel(): Action {
    if (this.resolveFn) return this.swapResolver((a) => a.hitCancel());
    return this.cutOnHit(ActionTag.HitCancel);
  }
  /** The same cut by a dash after its first hit — DODGE ON HIT — the dash a press of its own. */
  hitDodge(): Action { return this.dashOnHit(ActionTag.DodgeOnHit); }
  /** The same by a jump — JUMP ON HIT. */
  jumpOnHit(): Action { return this.dashOnHit(ActionTag.JumpOnHit); }
  private dashOnHit(kind: ActionTag): Action {
    const cut = this.resolveFn ? this.swapResolver((a) => a.cutOnHit(kind)) : this.cutOnHit(kind);
    return new ActionGroup(this.resolveFn ? "" : this.name, [cut, new DashMarker(kind === ActionTag.JumpOnHit, this, kind)], 1);
  }
  /** The same cast made on the way out, under its own name and a SWAP CANCEL tag — identical in
   *  every field: it plays to its last commit (never inside its no-swap frames, which throws), its
   *  hit landing on field, then `CANCEL_DELAY`, and the SWAP after it (or a 0-MV Outro) takes it off
   *  the field. */
  swapCancel(): Action {
    if (this.resolveFn) return this.swapResolver((a) => a.swapCancel(), ActionTag.SwapCancel);
    const out = this.variant(this.name, { tag: ActionTag.SwapCancel });
    out.formOf = this;
    return out;
  }
  /** This press cut on its first bullet's hit: the bullets committed by the time the next press
   *  truly starts, `CANCEL_DELAY` on, still land. */
  private cutOnHit(kind: ActionTag): Action {
    const first = Math.min(...this.bullets.map((h) => h.hitFrame));
    if (this.bullets.length < 2 || this.bullets.every((h) => h.hitFrame === first)) throw new Error(`${this.name}: ${kind} needs bullets hitting on more than one frame`);
    const out = this.variant(this.name, { tag: kind, bullets: this.bullets.filter((h) => h.commitFrame <= first + CANCEL_DELAY) });
    out.onHitAt = first;
    out.cancelOf = this;
    return out;
  }

  /** The same cast swapped out of `MASH_DELAY` after its no-swap frames end, the SWAP after it (or a
   *  0-MV Outro) taking it off the field — a press whose last commit falls inside them. */
  mashSwap(): Action {
    if (this.resolveFn) return this.swapResolver((a) => a.mashSwap(), ActionTag.MashSwap);
    const out = this.variant(this.name, { tag: ActionTag.MashSwap });
    out.formOf = this;
    return out;
  }
  /** The same cast swapped out of the moment it is pressed — `INSTA_DELAY`, then the SWAP after it
   *  (or a 0-MV Outro) — its hit still landing once the press would have reached it (`splitsHit()`).
   *  A press with no-swap frames can't be (it throws). */
  instaSwap(): Action {
    if (this.resolveFn) return this.swapResolver((a) => a.instaSwap(), ActionTag.InstaSwap);
    const out = this.variant(this.name, { tag: ActionTag.InstaSwap });
    out.formOf = this;
    return out;
  }
  /** A marker's swap form: a marker resolving to the swap form of whatever it resolves to, each
   *  made once. */
  private swapResolver(swap: (a: Action) => Action, tag?: ActionTag): Action {
    const resolve = this.resolveFn!, made = new Map<Action, Action>();
    const marker = new Action(this.name, {
      // a swap form's tag, so the compiler reads it as leaving the field (`leavesField()`)
      tag,
      resolve: () => {
        const a = resolve();
        if (!a) return null;
        let out = made.get(a);
        if (!out) made.set(a, (out = swap(a)));
        return out;
      },
    });
    if (tag) marker.formOf = this;
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
  dodgeOnHit(): Action {
    throw new Error("Method not implemented.");
  }
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
  override dodgeCancel(): Action { return this.dashLast((a) => a.dodgeCancel()); }
  override jumpCancel(): Action { return this.dashLast((a) => a.jumpCancel()); }
  override instaCancel(): Action { return this.withLast((a) => a.instaCancel()); }
  override instaDodge(): Action { return this.dashLast((a) => a.instaDodge()); }
  override instaJump(): Action { return this.dashLast((a) => a.instaJump()); }
  override swapCancel(): Action { return this.withLast((a) => a.swapCancel()); }
  override mashSwap(): Action { return this.withLast((a) => a.mashSwap()); }
  override hitCancel(): Action { return this.withLast((a) => a.hitCancel()); }
  override hitDodge(): Action { return this.dashLast((a) => a.hitDodge()); }
  override jumpOnHit(): Action { return this.dashLast((a) => a.jumpOnHit()); }
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
function dashed(after: Action, kind: ActionTag): ActionGroup {
  const insta = kind === ActionTag.InstaDodge || kind === ActionTag.InstaJump;
  const cut = insta ? after.instaForm(kind) : new CancelledStep(after, kind);
  const jump = kind === ActionTag.JumpCancel || kind === ActionTag.InstaJump;
  // a marker's group is named for what it resolves to, row by row (teamrun.ts's `toLines`)
  return new ActionGroup(after.resolveFn ? "" : after.name, [cut, new DashMarker(jump, after, kind)], 1);
}


/** The plain dash and jump — what a resonator without one of its own makes (`ResonatorDef.dodge`). */
export const DEFAULT_DODGE = new Action("Dodge", { animFrames: 20, cast: Cast.Dodge, animPriority: { 0: 9 }, castPriority: 6 });
export const DEFAULT_JUMP = new Action("Jump", { animFrames: 5, cast: Cast.Jump, animPriority: { 0: 9 }, castPriority: 8, endPosition: Position.Midair });
/** The dash out of an Echo cast, whoever makes it: casting at 14, it leaves even a transform (13). */
export const ECHO_DODGE = new Action("Dodge - Out of echo", { animFrames: 20, cast: Cast.Dodge, animPriority: { 0: 9 }, castPriority: 14 });
/** The dash (or jump) the acting resonator makes after `after`: out of an Echo cast (its `cast`, never a
 *  subcast) the echo dash, else their own, else the plain one. */
const dashFor = (isJump: boolean, after: Action): Action => {
  if (!isJump && after.cast === Cast.Echo) return ECHO_DODGE;
  const resonator = currentMember().resonator;
  return (isJump ? resonator?.jumpFn?.(after) : resonator?.dodgeFn?.(after)) ?? (isJump ? DEFAULT_JUMP : DEFAULT_DODGE);
};
/** What a dash written on its own follows: this member's last press of the visit, cut or not, else
 *  the Intro they arrived on. */
const lastPress = (): Action => {
  const last = ctx.state?.lastOwn;
  let a: Action | null = last && last.member === currentMember().name ? last.action : null;
  while (a && (a.cancelOf ?? a.formOf)) a = a.cancelOf ?? a.formOf;
  return a ?? currentMember().resonator?.intro?.() ?? INTRO;
};
/** A dodge or jump written in a rotation on its own, resolved when reached off the press it follows:
 *  the echo dash after an Echo cast, else the resonator's own (`ResonatorDef.dodge`/`jump`), else
 *  DEFAULT_DODGE / DEFAULT_JUMP. */
export const DODGE = new Action("Dodge Marker", { resolve: () => dashFor(false, lastPress()) });
export const JUMP = new Action("Jump Marker", { resolve: () => dashFor(true, lastPress()) });

/** The dash (or jump) a `dodge()`/`jump()` cut makes after `after`, resolved when reached the way
 *  INTRO is: the resonator's own for that press (Jingran's Shadow Step, Galbrena's Hellstride),
 *  else the plain one. Cut to an insta cancel by `run()` where the next press's cast priority beats
 *  the dash's own there. */
export class DashMarker extends Action {
  constructor(isJump: boolean, readonly after: Action, readonly kind: ActionTag) {
    super(isJump ? "Jump Placeholder" : "Dodge Placeholder", {
      resolve: () => {
        // an echo pressed whole, or one short enough to insta cancel with no dash: no dash at all
        const mainslot = currentMember().mainslot;
        const undashed = kind === ActionTag.InstaDodge && mainslot?.cancel.tag === ActionTag.InstaCancel;
        if (after === ECHO && mainslot && (undashed || !mainslot.onfield.cutPays(kind))) return null;
        return dashFor(isJump, after === INTRO ? currentMember().resonator?.intro?.() ?? after : after === ECHO ? mainslot?.onfield ?? after : after);
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
  constructor(readonly of: Action, readonly kind: ActionTag) {
    super(of.name);
  }
  override everyOther(): Action { return new CancelledStep(this.of.everyOther(), this.kind); }
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
  override dodgeCancel(): Action { return this.gated.dodgeCancel().everyOther(); }
  override jumpCancel(): Action { return this.gated.jumpCancel().everyOther(); }
  override instaCancel(): Action { return this.gated.instaCancel().everyOther(); }
  override instaDodge(): Action { return this.gated.instaDodge().everyOther(); }
  override instaJump(): Action { return this.gated.instaJump().everyOther(); }
  override hitCancel(): Action { return this.gated.hitCancel().everyOther(); }
  override hitDodge(): Action { return this.gated.hitDodge().everyOther(); }
  override jumpOnHit(): Action { return this.gated.jumpOnHit().everyOther(); }
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
export const NOINTRO = new Action("No Intro");

/** The Intro chain's entry, as the scheduler reads it: a rotation opens one with INTRO, never with
 *  this, which only names the chain. */
const INTRO_ENTRY = new Action("Intro");

/** The resonator's own Intro (`ResonatorDef.intro`), resolved when reached — the only Intro a
 *  rotation may write, cut like any press (`INTRO.cancel()`). */
export const INTRO = new Action("Intro Placeholder", {
  cast: Cast.Intro,
  resolve: () => {
    const intro = currentMember().resonator?.intro?.();
    if (!intro) throw new Error(`${currentMember().name} casts INTRO but their Resonator declares no intro`);
    return intro.resolveFn ? intro.resolveFn() : intro;
  },
});

/** The resonator's own Outro (`ResonatorDef.outro`), resolved when reached — the only Outro a
 *  rotation may write. */
export const OUTRO = new Action("Outro Placeholder", {
  cast: Cast.Outro,
  resolve: () => {
    const outro = currentMember().resonator?.outro?.();
    if (!outro) throw new Error(`${currentMember().name} casts OUTRO but their Resonator declares no outro`);
    return outro.resolveFn ? outro.resolveFn() : outro;
  },
});

/** Chain entries by team position: the Intro chain this resonator plays instead of the main one
 *  while they stand first or last (the positions START_FIRST/START_LAST name) — written as the
 *  marker (then INTRO, if the Intro it casts is cut), then the chain, closed by an outro of its own;
 *  from any other position it is simply never played, and a position with none plays the main
 *  chain. An INTRO_OPENER chain still takes the first arrival. */
export const INTRO_FIRST = new Action("Intro (First)");
export const INTRO_LAST = new Action("Intro (Last)");
const INTROS = [INTRO_FIRST, INTRO_LAST];
const introPosition = (action: Action): number => INTROS.indexOf(action);

/** The named position slot `i` stands in — 0 first, 1 last, -1 neither. The last slot is only
 *  last when nobody plays after it: a double-Intro leader brings their own main visit, and every
 *  other double-Intro member's, round after a last slot without one. */
export function slotPosition(rotations: Rotation[], i: number): number {
  const last = rotations.length - 1;
  if (i === 0) return 0;
  if (i !== last) return -1;
  return !rotations[0]!.doubleIntro || rotations[last]!.doubleIntro ? 1 : -1;
}

/** A marker resolving to one form of the equipped mainslot echo. */
const echoForm = (name: string, written: string, pick: (m: Mainslot) => Action): Action => new Action(name, {
  resolve: () => {
    const mainslot = currentMember().mainslot;
    if (!mainslot) throw new Error(`${currentMember().name} casts ${written} but has no Mainslot equipped`);
    return pick(mainslot);
  },
});
const ECHO_SWAP_FORM = echoForm("Echo Placeholder (swap)", "ECHO.swap()", (m) => m.outro);
const ECHO_INSTA_FORM = echoForm("Echo Placeholder (insta dash)", "ECHO.instaDodge()", (m) => (m.cancel.tag === ActionTag.InstaCancel || m.onfield.cutPays(ActionTag.InstaDodge) ? m.cancel : m.onfield));
const ECHO_INSTA_SWAP_FORM = echoForm("Echo Placeholder (insta swap)", "ECHO.instaSwap()", (m) => m.instaOut);

/** ECHO's own class: its swap and insta dash are the mainslot's own forms; every other cut is an
 *  ordinary step, taken only where it pays (`Action.cutPays`). */
class EchoMarker extends Action {
  override swapCancel(): Action { return ECHO_SWAP_FORM; }
  override instaSwap(): Action { return ECHO_INSTA_SWAP_FORM; }
  override instaDodge(): Action { return new ActionGroup("", [ECHO_INSTA_FORM, new DashMarker(false, this, ActionTag.InstaDodge)], 1); }
}

/** The "cast the equipped mainslot echo here" marker — every build equips exactly one, so a
 *  rotation names the slot rather than the echo, and says *how* it is pressed. What lands is the
 *  echo's own business (gear.ts's `Mainslot`): a press of the resonator's own — ECHO the full cast,
 *  cut like any other (`ECHO.dodgeCancel()`) where the cut frees them sooner, `ECHO.instaDodge()` the
 *  cast dash-cancelled before it lands, and `ECHO.swap()` the cast made on the way out, resolved
 *  right where it stands. */
export const ECHO: Action = new EchoMarker("Echo Placeholder (on field)", {
  resolve: () => {
    const mainslot = currentMember().mainslot;
    if (!mainslot) throw new Error(`${currentMember().name} casts ECHO but has no Mainslot equipped`);
    return mainslot.onfield;
  },
});

/** The markers a `chains` list reads as any press of their cast (`Action.follows()`). */
let CAST_MARKERS: Map<Action, Cast> | null = null;
const castMarkers = (): Map<Action, Cast> =>
  (CAST_MARKERS ??= new Map([[DODGE, Cast.Dodge], [JUMP, Cast.Jump], [INTRO, Cast.Intro], [ECHO, Cast.Echo]]));


/** The DOUBLE_INTRO section's entry, as the scheduler reads it. Written as the DOUBLE_INTRO marker,
 *  which casts INTRO (or the cut one written right after it, like INTRO_OPENER): a second Intro this
 *  resonator needs *before* their real one — usually a main DPS
 *  banking Intro effects twice. It takes the outro that would have opened the previous
 *  resonator's visit: the owner's Intro is cast, the section's casts play, and it leaves on its
 *  last cast's `.swap()` back — the previous resonator's visit is then their NOINTRO chain, whose outro
 *  hands forward for the main INTRO chain. Closed by an OUTRO of its own instead, the handback
 *  is that real outro, the previous resonator plays their whole normal visit in between, and no
 *  NOINTRO chain is needed. */
const DOUBLE_ENTRY = new Action("Double Intro");
export const DOUBLE_INTRO = new Action("Double Intro Marker");

/** Chain entry: the Intro chain this resonator plays the *first* time they arrive on an Outro,
 *  standing in for the INTRO chain below on that one visit — the opening burst a kit can only
 *  afford once, a bar it walked into the fight holding. Written as its own chain, closed by an
 *  OUTRO of its own, and cast exactly like an INTRO chain; every visit after is the ordinary INTRO
 *  chain. For everyone but the team's leader that first arrival is the Opener section; a leader
 *  opens on their NOINTRO chain instead, so theirs falls on the visit after it. */
export const INTRO_OPENER = new Action("Intro (Opener)");

/** The no-Intro chain's own first-arrival form: played in place of NOINTRO the one time a
 *  resonator arrives having never played, and only then — a leader's opening visit, or the first
 *  time a swap-out hands them the field. Every arrival after takes the ordinary NOINTRO chain. It
 *  is what INTRO_OPENER is for the other entry: a kit whose opening visit has something the loop
 *  hasn't (Hiyuki's fourth Iai, bought by being out of combat) writes it once here. Closed by an
 *  OUTRO of its own, or run into the INTRO_OPENER chain to share that chain's tail, exactly as
 *  NOINTRO may run into INTRO. */
export const NOINTRO_OPENER = new Action("No Intro (Opener)");


/** A chain's exit when it leaves on its last cast's `.swap()` rather than an Outro — never
 *  written or played, only compared: SWAP plays in its place, and the next slot plays their
 *  NOINTRO chain, which they must declare. */
const SWAP_EXIT = new Action("Swap Exit");

/** The swap out a swap form leaves on, played right after it unless an Outro follows
 *  (`runRotations()` puts it in): no frames, no cast — an OFF_FIELD row, dimmed. Its cast and an Outro's
 *  are the only things that take a resonator off the field: "lost on swap", the field handed on. */
export const SWAP = new Action("Swap", { tag: ActionTag.OffField });

/* ------------------------------------------------------------------------------ the rotation */

/** One visit to the field: what this resonator does, and how they leave. The entry marker is not
 *  in `body` — an Intro is prepended by the scheduler, and neither of the other two is a cast. An
 *  inline start-of-combat section still is, brackets and all: the scheduler strips the markers and,
 *  on a first visit, everything between them (see `runRotations()`). */
export interface Chain {
  entry: Action;
  /** The Intro an entry casts, as the rotation wrote it (`Intro.cancel()`) — unused by a NOINTRO
   *  chain. */
  cast?: Action;
  body: Action[];
  /** The outro the rotation wrote, or SWAP_EXIT for a chain that leaves on its last cast's `.swap()`. */
  exit: Action;
}

/** A visit's cooldown-gated presses and how many frames after its handoff each comes up, off what
 *  its presses charge the clock — for a handoff into a visit not played yet. Every gated press
 *  counts, a cooldown used twice twice. `intro` is the arriving member's own (none: no timing past
 *  it), and `resolve` reads a marker (INTRO cut as written, an Intro Resolver, ECHO) the way the
 *  incoming member would reach it, on the bars the presses before it bank; one resolving to no
 *  press takes no time. Leaves out the engine's own follow-ups, so a press can come up later than
 *  this says, never earlier. */
export function chainGates(chain: Chain, intro: Action | null, resolve: (marker: Action, bars: readonly number[]) => Action | null, bars: readonly number[], cap: readonly number[]): VisitGate[] {
  // every press as it will play: a marker resolved, a hold cancel reading the press after it
  const presses: { pressed: Action; a: Action; cut: ActionTag | null }[] = [];
  const { members, lastMarker } = chainMembers(chain);
  // the bars each marker resolves on: every press before it banked whole (Sigrika's Skill reads
  // the Full Stop her Schemata banked)
  const seen = [...bars];
  let gated = false;
  for (let n = 0; n < members.length; n++) {
    const m = members[n]!;
    // the Intro as written, cut and all — INTRO resolves to the arriving member's own
    if (m === chain.cast && !intro) break;
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
  for (let n = 0; n < presses.length; n++) if (presses[n]!.cut === ActionTag.HoldCancel || presses[n]!.cut === ActionTag.MashCancel) lastHold = n;
  const out: VisitGate[] = [];
  const g = [...bars];
  let t = 0;
  for (let n = 0; n < presses.length; n++) {
    const { pressed, a, cut } = presses[n]!;
    if (a.cooldown) out.push({ cd: a.cooldown, offset: t, press: pressed.name });
    const hold = cut === ActionTag.HoldCancel || cut === ActionTag.MashCancel ? a.holdAt(g, cap, presses[n + 1]?.pressed ?? null, null, [], cut === ActionTag.MashCancel) : -1;
    t += (hold >= 0 ? a.holdCost(hold) : a.cost(cut ?? a.tag)).total;
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
  const cast = a.castGains, reset = a.resetBars, gains = a.bulletGains, bullets = a.bullets, isCast = a.cast !== null;
  for (let k = 0; k < 7; k++) {
    let v = bankBar(k, g[k]!, cast[k]!, reset[k]!, isCast, cap);
    for (let j = 0; j < bullets.length; j++) if (hold < 0 || bullets[j]!.commitFrame <= hold) v = bankBar(k, v, gains[j * 7 + k]!, false, false, cap);
    g[k] = v;
  }
}

/** A resonator's rotation, compiled into the ways they can arrive. Only `intro` is required: a
 *  resonator with no start-of-combat section for the position they stand in sits out the fight's
 *  opening scramble, one with no
 *  NOINTRO chain simply can't lead a team, and `doubleIntro` marks the pre-Intro visit a
 *  DOUBLE_INTRO section declares (see `runRotations()`). */
export class Rotation {
  /** What each start-of-combat section holds, by the team position it is for (START_FIRST/LAST,
   *  then START's for any) — body only, closing cast included. `null` where none is declared. */
  startCombat: (Action[] | null)[] = [null, null, null];
  opener: Chain | null = null;
  intro: Chain;
  /** The DOUBLE_INTRO section: `exit` is SWAP_EXIT for the swap-back form (its last cast's
   *  `.swap()`, running into the Intro) or its outro for the outro-back form. */
  doubleIntro: Chain | null = null;
  /** The DOUBLE_INTRO section's first-arrival form: an INTRO_OPENER written part-way through it
   *  has the first pre-visit play only the tail after it. */
  firstDoubleIntro: Chain | null = null;
  /** The INTRO_OPENER chain, played in place of `intro` on this resonator's first arrival. */
  firstIntro: Chain | null = null;
  /** The NOINTRO_OPENER chain, played in place of `opener` on that same first arrival. */
  firstOpener: Chain | null = null;
  /** The INTRO_FIRST/LAST chains, each played in place of `intro` while this resonator stands in
   *  that position (`slotPosition()`). */
  intros: (Chain | null)[] = [null, null];

  constructor(actions: Action[]) {
    // `intro@n` are the per-position chains' own phases
    let phase: "none" | "opener" | "double" | "intro" | "first" | "firstOpener" | `intro@${number}` = "none";
    const prefix: Action[] = [], loop: Action[] = [], dbl: Action[] = [], first: Action[] = [], firstPre: Action[] = [];
    const loops: Action[][] = [[], []];
    // which positions' start-of-combat sections are open — more than one where the markers were
    // written back to back, which is how a section that reads the same from two positions is
    // spelled (`START_FIRST, START_LAST, Skill.swap()`) — and what each has collected
    let inStart: number[] = [];
    const starts: (Action[] | null)[] = [null, null, null];
    const body = (): Action[] | null =>
      (phase === "opener" ? prefix : phase === "intro" ? loop : phase === "double" ? dbl : phase === "first" ? first
        : phase === "firstOpener" ? firstPre
        : phase.startsWith("intro@") ? loops[Number(phase.slice(6))]! : null);
    // set when the NOINTRO chain ran into the INTRO marker rather than an outro of its own, which
    // is what makes the two share everything from there down
    let shared = false;
    // ...and the same for a NOINTRO chain that ran into DOUBLE_INTRO instead (see that branch)
    let sharedDouble = false;
    // ...and for a NOINTRO_OPENER chain that ran into INTRO_OPENER, the first-arrival pair sharing
    // their tail exactly as NOINTRO and INTRO do
    let sharedFirst = false;
    let openerExit: Action | null = null, introExit: Action | null = null, doubleExit: Action | null = null;
    let firstExit: Action | null = null, firstOpenerExit: Action | null = null;
    // an INTRO_OPENER written part-way through an Intro chain or a DOUBLE_INTRO section: where in
    // that chain's body the first arrival picks it up, the Intro still cast ahead of it
    let firstFrom: { phase: "intro" | "double"; at: number } | null = null;
    const introExits: (Action | null)[] = [null, null];

    // OUTRO or SWAP_EXIT ending whichever chain is open
    const close = (action: Action): void => {
      if (phase === "opener") { openerExit = action; phase = "none"; }
      else if (phase === "intro") { introExit = action; phase = "none"; }
      else if (phase === "double") { doubleExit = action; phase = "none"; }
      else if (phase === "first") { firstExit = action; phase = "none"; }
      else if (phase === "firstOpener") { firstOpenerExit = action; phase = "none"; }
      else if (phase.startsWith("intro@")) { introExits[Number(phase.slice(6))] = action; phase = "none"; }
      else throw new Error(`rotation: ${action.name} closes a chain that was never opened`);
    };

    // the Intro each chain opens with, as written; an INTRO_OPENER / INTRO_FIRST / INTRO_LAST marker takes the one
    // written right after it, or a plain INTRO where none is
    const cuts = new Map<string, Action>();
    let castFor: string | null = null;
    // the chain open, its last cast leaving on a `.swap()` — what closes it without an outro
    const leftOnSwap = (): boolean => {
      const into = body();
      return !!into && !inStart.length && into.length > 0 && leavesField(into[into.length - 1]!);
    };
    const entries = [...actions];
    while (entries.length) {
      const written = entries.shift()!;
      const [bare, step] = unstep(written);
      // a marker that casts INTRO, cut (`INTRO_LAST.mashCancel()`), is that marker and the INTRO it casts, cut
      if (step && (bare === INTRO_OPENER || bare === DOUBLE_INTRO || introPosition(bare) >= 0)) {
        entries.unshift(bare, new CancelledStep(INTRO, step.kind));
        continue;
      }
      const action = written;
      if (isIntro(written) && introOf(written) !== INTRO) throw new Error(`rotation: write INTRO, not ${introOf(written).name}`);
      if (isOutro(bare) && bare !== OUTRO) throw new Error(`rotation: write OUTRO, not ${bare.name}`);
      if (castFor) {
        const own = !isIntro(written);
        cuts.set(castFor, own ? INTRO : written);
        castFor = null;
        if (!own) continue;
      }
      if (step && (isOutro(bare) || bare === NOINTRO || startPosition(bare) >= 0)) {
        throw new Error(`rotation: ${bare.name} can't be cut short`);
      }
      if (startPosition(action) >= 0) {
        const at = startPosition(action);
        if (starts[at]) throw new Error(`rotation: only one ${action.name} section`);
        if (phase !== "none") throw new Error(`rotation: ${action.name} opens its section inside a chain; it goes ahead of them`);
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
        // the cast that leaves the field is the section's last
        if (leavesField(action)) inStart = [];
      } else if (opensChain(action) && leftOnSwap()) {
        // a chain whose last cast left on its `.swap()` is closed by it: the marker opens the next
        close(SWAP_EXIT);
        entries.unshift(written);
      } else if (action === NOINTRO) {
        if (openerExit || prefix.length || shared || sharedDouble) throw new Error("rotation: only one NOINTRO chain");
        if (phase !== "none") throw new Error("rotation: NOINTRO opens a chain while one is still open");
        phase = "opener";
      } else if (action === DOUBLE_INTRO) {
        if (doubleExit || dbl.length) throw new Error("rotation: only one DOUBLE_INTRO section");
        castFor = "double";
        // a NOINTRO chain running into DOUBLE_INTRO shares the section: leading, the opener is the
        // prefix and then the pre-visit's own casts, leaving on the pre-visit's outro
        if (phase === "opener") sharedDouble = true;
        else if (phase !== "none") throw new Error("rotation: DOUBLE_INTRO opens a chain while one is still open");
        phase = "double";
      } else if (action === INTRO_OPENER && (phase === "intro" || phase === "double")) {
        // part-way through a chain: the first arrival casts its Intro and skips straight here
        if (firstExit || first.length || firstFrom) throw new Error("rotation: only one INTRO_OPENER chain");
        firstFrom = { phase, at: body()!.length };
      } else if (action === INTRO_OPENER) {
        if (firstExit || first.length || firstFrom) throw new Error("rotation: only one INTRO_OPENER chain");
        castFor = "first";
        // the walk-through: an INTRO_OPENER reached inside an open NOINTRO_OPENER chain isn't cast, it
        // just marks where the tail the two share begins
        if (phase === "firstOpener") sharedFirst = true;
        else if (phase !== "none") throw new Error("rotation: INTRO_OPENER opens a chain while one is still open");
        phase = "first";
      } else if (action === NOINTRO_OPENER) {
        if (firstOpenerExit || firstPre.length || sharedFirst) throw new Error("rotation: only one NOINTRO_OPENER chain");
        if (phase !== "none") throw new Error("rotation: NOINTRO_OPENER opens a chain while one is still open");
        phase = "firstOpener";
      } else if (introPosition(action) >= 0) {
        const n = introPosition(action);
        castFor = `intro@${n}`;
        if (introExits[n] || loops[n]!.length) throw new Error(`rotation: only one ${action.name} chain`);
        if (phase !== "none") throw new Error(`rotation: ${action.name} opens a chain while one is still open`);
        phase = `intro@${n}`;
      } else if (isIntro(action)) {
        // an Intro inside an already-open Intro chain is a cast, not a chain boundary — Camellya's
        // double Intro
        if (phase === "intro" || phase === "first") { body()!.push(written); continue; }
        if (phase.startsWith("intro@")) { loops[Number(phase.slice(6))]!.push(written); continue; }
        if (introExit) throw new Error("rotation: only one Intro chain");
        cuts.set("intro", written);
        // the walk-through: an INTRO reached inside an open NOINTRO chain isn't cast, it just marks
        // where the tail the two share begins
        if (phase === "opener") shared = true;
        // a DOUBLE_INTRO section leaves on its last cast's `.swap()` (closed above) or its outro
        if (phase === "double") throw new Error("rotation: a DOUBLE_INTRO section runs into the Intro without leaving on a cast's .swap()");
        phase = "intro";
      } else if (isOutro(action)) {
        close(action);
      } else {
        const into = body();
        if (!into) throw new Error(`rotation: ${action.name} sits outside any action chain`);
        into.push(action);
      }
    }

    if (inStart.length) throw new Error(`rotation: the ${inStart.map((at) => STARTS[at]!.name).join(" / ")} section is never closed by a cast's .swap()`);
    if (phase !== "none" && leftOnSwap()) close(SWAP_EXIT);
    if (phase !== "none") throw new Error("rotation: a chain is left open with neither an outro nor a .swap() to close it");
    // a rotation written only for named positions (INTRO_FIRST/INTRO_LAST) has no
    // main chain of its own: the first position written stands in wherever no chain is named
    const stand = introExits.findIndex(Boolean);
    if (!introExit && stand < 0) throw new Error("rotation: every rotation needs an Intro chain closed by an outro");
    if (!introExit) { introExit = introExits[stand]!; loop.push(...loops[stand]!); }
    this.startCombat = starts.map((cast) => (cast && cast.length ? cast : null));
    if (sharedDouble) {
      // the swap-back form hands to the previous slot's NOINTRO chain, and a leader has none to hand to
      if (!doubleExit || doubleExit === SWAP_EXIT) throw new Error("rotation: a NOINTRO chain shared with a DOUBLE_INTRO section needs that section closed by an outro, not run into the Intro");
      this.opener = { entry: NOINTRO, body: [...prefix, ...dbl], exit: doubleExit };
    } else if (openerExit || shared) {
      // the shared form runs the prefix and then everything the Intro chain does, minus the Intro
      this.opener = { entry: NOINTRO, body: shared ? [...prefix, ...loop] : prefix, exit: openerExit ?? introExit };
    } else if (prefix.length) {
      throw new Error("rotation: the NOINTRO chain is closed by neither an outro nor an Intro");
    }
    if (doubleExit) this.doubleIntro = { entry: DOUBLE_ENTRY, cast: cuts.get("double"), body: dbl, exit: doubleExit };
    if (firstFrom?.phase === "double" && this.doubleIntro) this.firstDoubleIntro = { ...this.doubleIntro, body: dbl.slice(firstFrom.at) };
    // an Intro chain's entry, not INTRO_OPENER: it is an Intro chain in every way the scheduler
    // cares about, and only which visit plays it differs
    if (firstExit) this.firstIntro = { entry: INTRO_ENTRY, cast: cuts.get("first"), body: first, exit: firstExit };
    // entry NOINTRO for the same reason the one above is INTRO: it arrives the way an opener does,
    // and only which visit plays it differs
    if (firstOpenerExit || sharedFirst) {
      this.firstOpener = { entry: NOINTRO, body: sharedFirst ? [...firstPre, ...first] : firstPre, exit: firstOpenerExit ?? firstExit! };
    } else if (firstPre.length) {
      throw new Error("rotation: the NOINTRO_OPENER chain is closed by neither an outro nor an INTRO_OPENER");
    }
    this.intro = { entry: INTRO_ENTRY, cast: cuts.get("intro") ?? cuts.get(`intro@${stand}`), body: loop, exit: introExit };
    if (firstFrom?.phase === "intro") this.firstIntro = { ...this.intro, body: loop.slice(firstFrom.at) };
    for (const n of [0, 1]) {
      const exit = introExits[n];
      if (exit) this.intros[n] = { entry: INTRO_ENTRY, cast: cuts.get(`intro@${n}`), body: loops[n]!, exit };
    }
  }
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
  isIntro(a) || [NOINTRO, NOINTRO_OPENER, INTRO_OPENER, DOUBLE_INTRO, ...INTROS].includes(a);
const unstep = (a: Action): [Action, CancelledStep | null] => (a instanceof CancelledStep ? [a.of, a] : [a, null]);

/** Does this entry leave the field — a cast's `swap()` / `instaSwap()` form, the echo's, or a group
 *  ending on one? What closes a start-of-combat section. */
function leavesField(a: Action): boolean {
  const last = a instanceof ActionGroup ? a.actions[a.actions.length - 1]! : a;
  if (last === ECHO_SWAP_FORM || last === ECHO_INSTA_SWAP_FORM) return true;
  return (last.tag === ActionTag.SwapCancel || last.tag === ActionTag.InstaSwap || last.tag === ActionTag.MashSwap) && (last.formOf ?? last.cancelOf) !== null;
}
/** A swap form goes last in its chain or section, or right before its Outro — `list` as `who`
 *  plays it. */
function checkSwapOuts(who: string, list: Action[]): void {
  list.forEach((a, k) => {
    const next = list[k + 1];
    const inner = a instanceof ActionGroup && a.actions.slice(0, -1).some(leavesField);
    if (!inner && !(leavesField(a) && next && !isOutro(next))) return;
    throw new Error(`${who}: ${a.name} swaps out with ${next?.name ?? "its own group"} still to play — a swap form goes last in its chain, or right before its Outro`);
  });
}
/** The same entry pressed without leaving: what a start section's closing cast plays when there
 *  is nobody to swap to, and its owner stays on field. */
function staysOnField(a: Action): Action {
  if (a instanceof ActionGroup) return new ActionGroup(a.name, [...a.actions.slice(0, -1), staysOnField(a.actions[a.actions.length - 1]!)]);
  return a === ECHO_SWAP_FORM || a === ECHO_INSTA_SWAP_FORM ? ECHO : a.formOf ?? a.cancelOf ?? a;
}

/* ----------------------------------------------------------------------------- the scheduler */

/**
 * Run every member's rotation across `state`, in the order the fight actually goes.
 *
 * The opening scramble first: every start-of-combat section written for the position its own
 * member actually stands in, in team order, each ending on a
 * plain swap into the next (and the last of them swapping to slot 1). A section written inline in
 * its own rotation is then skipped on that member's first visit — they just spent it — and plays
 * normally on every visit after. Then slot 1's own NOINTRO
 * chain, since nobody has outro'd yet and so nobody has an Intro to cast. From there it is Intro
 * chains all the way — an Outro hands the field on, whoever it lands on runs theirs — until every
 * section is filled.
 *
 * A leader with a DOUBLE_INTRO section of their own changes the trip's shape: every pre-visit in
 * team order, a member without one playing their only visit in its place, then every main visit
 * in team order (Jinhsi > Hsin > Shorekeeper reads Jin1 Hsin1 SK Jin2 Hsin2), the opener standing
 * in for the leader's first pre-visit.
 *
 * A section closes on the Intro the *last* slot's own Outro hands into — one full trip round the
 * team, ending where the next begins. The outro's own follow-ups, that Intro, and whatever the
 * Intro itself queued all belong to the section they close; the first rotation cast of the visit
 * opens the next one. Trips go on until `count` sections have closed; the hits still in flight
 * then land, and the fight ends where the next section's Intro would have begun.
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
  const openerChain = (i: number): Chain | null => rotations[i]!.opener ?? rotations[i]!.firstOpener;
  if (!openerChain(0)) return `${names[0]} leads the team but declares no NOINTRO chain`;
  for (let i = 0; i < rotations.length; i++) {
    const r = rotations[i]!, nxt = (i + 1) % rotations.length;
    if ([r.intros[slotPosition(rotations, i)] ?? r.intro, r.firstIntro, r.firstOpener, openerChain(i)].some((c) => c?.exit === SWAP_EXIT) && !openerChain(nxt)) {
      return `${names[nxt]} follows ${names[i]}'s swap-out but declares no NOINTRO chain`;
    }
    const d = r.doubleIntro;
    if (!d) continue;
    const prev = (i + rotations.length - 1) % rotations.length;
    if (d.exit === SWAP_EXIT && !openerChain(prev)) return `${names[prev]} plays during ${names[i]}'s double Intro but declares no NOINTRO chain`;
    if (d.exit === SWAP_EXIT && rotations[0]!.doubleIntro) return `${names[i]}: a swap-form double Intro can't play in a team whose leader has a double Intro`;
    if (d.exit !== SWAP_EXIT && i === 1 && !rotations[0]!.doubleIntro && !(rotations[2]?.doubleIntro && rotations[2]!.doubleIntro!.exit !== SWAP_EXIT)) {
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

/** `blind`: a handoff found no successor learned yet (see `State.successorMissed`) — the caller
 *  plays the fight again, every successor now known. */
export function runRotations(state: State, rotations: Rotation[], count: number): { sections: Result[][]; starts: number[]; end: number; blind: boolean } {
  const why = teamPlayable(rotations, state.slots.map((s) => s.name));
  if (why) throw new Error(why);
  // Whoever has already played, and so which of the two forms of a chain an arrival takes: the
  // first-arrival ones are the chain a resonator plays the one time they turn up having never
  // acted, whichever entry that arrival uses.
  const visited = new Set<number>();
  // a slot's own no-Intro chain: its first-arrival form, else the plain one
  const openerChain = (i: number): Chain | null => {
    const r = rotations[i]!;
    return !visited.has(i) && r.firstOpener ? r.firstOpener : r.opener ?? r.firstOpener;
  };
  // ...and its DOUBLE_INTRO pre-visit the same way, undefined where it declares none
  const doubleChain = (i: number): Chain | undefined => {
    const r = rotations[i]!;
    return (!visited.has(i) && r.firstDoubleIntro) || r.doubleIntro || undefined;
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
  // another visit is due until `count` sections have closed
  const going = (): boolean => section + (closing ? 1 : 0) < count;
  // the fight ends past the last handoff's swap, where the next Intro would have begun; the hits
  // still in flight land then, in the section that cast them
  const finish = (): { sections: Result[][]; starts: number[]; end: number; blind: boolean } => {
    state.plannedGates = null;
    state.handoffWaits = false;
    const blind = state.successorMissed;
    state.successor = null;
    const handoff = state.lastHandoff;
    state.lastHandoff = null;
    // The fight ends where the incoming Intro the last Outro hands into does, as every section
    // does: that Intro plays, and what is due by its end lands. A last visit leaving on a swap ends
    // on that swap. Whatever is still in flight past the end (an insta-swapped press's hits) never
    // lands.
    let end = 0, endReal = 0, cutoff = 0;
    // a break already draining as the fight ends holds its end back; one the closing Intro sets off does not
    const drainUntil = state.drainUntil;
    const playIntro = (to: number, visit: Chain | null): void => {
      const chain = visit?.cast ? visit : introChain(to);
      state.active = to;
      if (handoff) state.slots[to]!.arrive(handoff.from, handoff.at);
      state.slots[to]!.visitChain = chain;
      // cut as if the loop went on: a hold or mash lets go into the press its chain casts next
      ctx.holdBeyond = chain.body.length ? introOf(chain.body[0]!) : null;
      try {
        out[section]!.push(...run(state, [chain.cast!]));
      } finally {
        ctx.holdBeyond = null;
      }
      cutoff = endReal = Math.max(state.real, state.playsTo);
      end = state.gameOf(endReal);
    };
    if (fightEnd) {
      // the outro and the Intro it hands into stay; the fight ends where the row after that Intro begins
      const rows = out[section]!;
      const at = rows.indexOf(fightEnd);
      let intro = -1;
      for (let k = at + 1; k < rows.length && intro < 0; k++) if (isCast(rows[k]!.action, Cast.Intro) && !rows[k]!.queued) intro = k;
      const next = intro >= 0 ? rows.slice(intro + 1).find((r) => !r.queued) : undefined;
      if (intro >= 0) {
        // the press after the Intro is where it ended, else the clock stands at its end
        if (next) rows.length = rows.indexOf(next);
        cutoff = endReal = next ? next.realStarts : Math.max(state.real, state.playsTo);
        end = state.gameOf(endReal);
      } else if (at === rows.length - 1 && state.onField >= 0) {
        // nothing ran after the outro: the Intro it hands into plays now
        playIntro(state.onField, null);
      } else {
        rows.length = Math.max(0, at);
        end = fightEnd.starts;
        endReal = fightEnd.realStarts;
        cutoff = endReal - SWAP_DELAY;
      }
    } else if (finalTo >= 0) {
      playIntro(finalTo, finalVisit);
    } else {
      // the last member's swap out: its delay is already the swap form's own, and SWAP played
      cutoff = endReal = Math.max(state.real, state.playsTo);
      end = state.gameOf(endReal);
    }
    state.timed = state.timed.filter((h) => h.due <= cutoff);
    // ...and nothing what lands queues past it plays either (Hecate's next attack, say)
    if (state.timed.length || state.behindNext.length) out[section]!.push(...run(state, [], true, cutoff));
    // a break the drain cast can't be swapped out of: the swap, and the fight's end, come after it
    if (drainUntil > endReal - SWAP_DELAY && drainUntil < Infinity) {
      endReal = drainUntil + SWAP_DELAY;
      end = state.gameOf(endReal);
    }
    return { sections: out, starts, end, blind };
  };

  // The section the last slot has just outro'd out of ends with that visit and the incoming Intro
  // its outro hands into: `closing` says the next section opens on the rows after that Intro
  // (`afterIntro`), or at once where the field arrived on a swap, with no Intro to cast.
  let closing = false, afterIntro = false;
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
  // the fight's last visit left on its Outro: who it hands to (-1 for none), and the visit they
  // are known to arrive on — the incoming Intro plays before the end
  let finalTo = -1, finalVisit: Chain | null = null;
  // where a held close's outro sits in its section, and the frame the incoming member was handed
  // the field there
  let pendingAt = -1, pendingOpens = 0;
  // Which slots have had their own visit this trip round the team, and which slot the trip opened
  // on. A double-Intro pair spends its pre-visits *inside* the trip, so the field can come back to
  // a slot that is already done with — it steps over that slot rather than giving it a second
  // visit, and the trip begins again when it reaches the one that opened it.
  const doubled = new Set<number>(), mained = new Set<number>();
  let cycleStart = 0;
  /** Where an Intro just placed ends: the game frame its next press starts on, or where the clock
   *  stands with none placed yet. */
  const introEnd = (after: Result[]): number => {
    const next = after.find((r) => !r.queued);
    return state.gameOf(next ? next.realStarts : Math.max(state.real, state.playsTo));
  };
  const place = (snaps: Result[]): void => {
    // nothing past the last section: a visit that runs two chains (a double-Intro pre-visit and
    // then its own) can close the final section on the first and still place the second
    if (closing) {
      let k = -1;
      if (afterIntro) for (let j = 0; j < snaps.length && k < 0; j++) if (isCast(snaps[j]!.action, Cast.Intro) && !snaps[j]!.queued) k = j;
      // the incoming Intro is the closing section's last row, and the next opens where it ends: the
      // press after it, on the game clock (a row's own `starts` carries its lead-in)
      if (k >= 0) {
        out[section]!.push(...snaps.slice(0, k + 1));
        snaps = snaps.slice(k + 1);
        opensAt = introEnd(snaps);
      }
      section++;
      closing = false;
      afterIntro = false;
      out.push([]);
      starts.push(opensAt);
    }
    out[section]!.push(...snaps);
  };

  // An INTRO_OPENER chain stands in for the ordinary one until this slot has played at all — the
  // same `visited` the no-Intro pair reads, so a leader's opening visit spends whichever
  // first-arrival chain it enters on rather than leaving the other standing for the next.
  const introChain = (i: number): Chain => {
    const r = rotations[i]!;
    // the chain written for the position this slot stands in, where there is one
    const main = r.intros[slotPosition(rotations, i)] ?? r.intro;
    return !visited.has(i) && r.firstIntro ? r.firstIntro : main;
  };
  // whether the field arrived on a plain swap rather than an outro: no Intro to cast, so the
  // slot swapped into plays their NOINTRO chain instead (`teamPlayable()` requires one)
  let swapped = false;
  const arrival = (i: number): Chain => {
    if (!swapped) return introChain(i);
    swapped = false;
    const c = openerChain(i);
    if (!c) throw new Error(`${state.slots[i]!.name} is swapped into but declares no NOINTRO chain`);
    return c;
  };

  // a handoff with nothing learned yet times the visit it opens off that visit's own presses — the
  // one it was seen to open, else the slot's usual one
  const planned = (to: number, swap: boolean, visit: object | null = null): VisitGate[] | null => {
    const chain = (visit as Chain | null) ?? (swap ? openerChain(to) : introChain(to));
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
    return chainGates(chain, into.resonator?.intro ? INTRO : null, resolve, [into.energy, into.concerto, ...into.forte], into.resonator?.maxForte ?? [0, 0, 0, 0, 0]);
  };
  state.plannedGates = (to, visit) => planned(to, false, visit);
  state.handoffWaits = true;
  if (rotations.some((r) => r.doubleIntro)) {
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
    // the outro is the OUTRO marker itself, resolved on its own row (see it): a kit's Unison form
    // depends on what the visit granted by then
    // a chain leaving on its last cast's `.swap()` has no exit row: the cast already left
    swapped = chain.exit === SWAP_EXIT;
    // the visit that closes the fight leaves on its Outro too, into the incoming Intro the fight
    // ends on (`finish()`); one leaving on a swap ends there
    const closes = i === closer && chain.entry !== DOUBLE_ENTRY && !awaiting;
    const final = closes && section + 1 >= count;
    const exit = swapped ? [] : [chain.exit];
    const list = chain.entry === INTRO_ENTRY || chain.entry === DOUBLE_ENTRY ? [chain.cast!, ...casts, ...exit] : [...casts, ...exit];
    state.slots[i]!.visitChain = chain;
    checkSwapOuts(state.slots[i]!.name, list);
    const snaps = run(state, list);
    state.outroDir = 1;
    // an Outro row advances the field itself (evaluate.ts); a swap hands it forward here — held
    // first, on the one swapping out, until the incoming visit's cooldown-gated press would land ready
    // the fight's last swap out holds for the next visit's cooldown like every other, so the last
    // rotation ends where the others do
    const next = final && state.successor ? state.successorOf(chain) : null;
    const after = !final ? -1 : state.successor ? next?.slot ?? -1 : (i + 1) % rotations.length;
    if (final && !swapped) {
      finalTo = after;
      finalVisit = (next?.visit as Chain | undefined) ?? null;
    }
    if (final && !exit.length && after >= 0 && state.handoffWaits) {
      const into = state.slots[after]!;
      const from = Math.max(state.real, state.playsTo);
      const short = into.handoffShortfall(chain, state.gameOf(from + SWAP_DELAY), planned(after, false, next?.visit ?? null));
      if (short) snaps.push(...run(state, [short.cd.wait(short.frames, short.press)]));
    }
    if (swapped) {
      const to = (i + 1) % rotations.length;
      const seen = state.successor ? state.successorOf(chain) : null;
      const from = Math.max(state.real, state.playsTo);
      const short = (!state.successor || seen?.slot === to) && state.handoffWaits ? state.slots[to]!.handoffShortfall(chain, state.gameOf(from), planned(to, true, seen?.visit ?? null)) : null;
      if (short) snaps.push(...run(state, [short.cd.wait(short.frames, short.press)]));
      // the swap itself, once every wait the one leaving holds for is played
      snaps.push(...run(state, [SWAP]));
      const handoff = state.gameOf(Math.max(state.real, state.playsTo));
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
      afterIntro = true;
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
        afterIntro = !swapped;
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
    // the section leaves on its own last cast's swap form; with nobody to swap to, the resonator
    // carries straight on and that cast stays on field
    const opening = startOf(i)!;
    const last = opening[opening.length - 1]!;
    checkSwapOuts(state.slots[i]!.name, opening);
    const stays = next === i && leavesField(last);
    const chain = stays ? [...opening.slice(0, -1), staysOnField(last)] : leavesField(last) ? [...opening, SWAP] : opening;
    out[section]!.push(...run(state, chain));
    state.active = next;
  }
  state.inStart = false;

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
    // this slot's NOINTRO chain fills the field until its own outro hands forward for the main
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
      !mained.has(at) && !doubled.has(at) && !!rotations[at]!.doubleIntro && rotations[at]!.doubleIntro!.exit !== SWAP_EXIT;
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
        checkSwapOuts(state.slots[nxt]!.name, [d.cast!, ...d.body]);
        place(run(state, [d.cast!, ...d.body, SWAP]));
        state.outroDir = 1;
        state.active = i;
        runChain(i, openerChain(i)!); // the NOINTRO fill; its outro hands forward
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
    // the next section opens after the Intro the field comes back on, as an unheld close's does
    afterIntro = true;
    if (pendingAt >= 0) opensAt = pendingOpens;
  }

  // A leader with a double Intro of their own: pre-visits in team order, a slot without one playing
  // its whole visit in its place, then the main visits in team order (see the header). The trip
  // ends on the last of those. Outro-form sections only — a swap-back form leans on the previous
  // slot's NOINTRO fill, which this shape has no place for.
  if (rotations[0]!.doubleIntro) {
    closer = rotations.reduce((at, r, i) => (r.doubleIntro ? i : at), 0);
    let first = true, trips = 0;
    while (going()) {
      if (++trips > 1000) throw new Error("rotation scheduler never closed its sections");
      // the opener already stood in for the leader's first pre-visit
      for (let i = first ? 1 : 0; i < rotations.length && going(); i++) runChain(i, doubleChain(i) ?? arrival(i));
      first = false;
      for (let i = 0; i < rotations.length && going(); i++) {
        if (rotations[i]!.doubleIntro) runChain(i, arrival(i));
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
