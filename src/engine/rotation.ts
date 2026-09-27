/**
 * Rotations, and the scheduler that decides whose turn it is.
 *
 * A resonator's rotation is not a flat list of casts — it's up to three *action chains*, one per
 * way of arriving on field, and a kit writes all three as a single array that `Rotation`'s
 * constructor splits apart:
 *
 *   new Rotation([
 *     START_2, Skill,                                       // the fight's own first seconds
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
 * leaves the field on an OUTRO or on a cast's own `.swap()`; there is no bare swap to write.
 */
import { Gear } from "./gear.js";
import { run } from "./evaluate.js";
import { currentMember } from "./context.js";
import type { GearDef, Mainslot } from "./gear.js";
import type { State } from "./state.js";
import type { Result } from "./evaluate.js";
import { Cast, ActionTag } from "./stats.js";
import type { Attribute, Type, Subtype, Node, Scaling } from "./stats.js";

/* ------------------------------------------------------------------------------- the action */

export interface ActionDef extends GearDef {
  element?: Attribute | null;
  type?: Type | null;
  subtype?: Subtype | null;
  cast?: Cast | null;
  subcast?: Cast | null;
  node?: Node | null;
  scaling?: Scaling | null;
  mv?: number;
  /** How much Resonance Energy/Concerto/Off-tune this action's *hit* generates — the baseline
   *  every action carries regardless of any buff, same declared-once shape as `mv`. evaluate()
   *  banks it into the running total automatically (TeamMember.energy/concerto, State.offtune)
   *  right alongside whatever AddEnergy/AddConcerto/AddOfftune a held buff contributed — a kit
   *  never touches these fields itself, only declares them per action. */
  energy?: number;
  concerto?: number;
  offtune?: number;
  /** What the *cast* banks instead, the moment it is pressed: a spend (an outro's -100 Concerto,
   *  a forte drain), and the flat regen a kit grants on the press rather than on a landed hit.
   *  Kept apart from the hit's so a press whose hit lands later (an outro, an insta swap, a
   *  summon) or never (an insta cut) still pays its cast share then. */
  castEnergy?: number;
  castConcerto?: number;
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
  /** How much this cast moves the acting resonator's own forte gauges 1-5 — same declared-once
   *  shape as `energy`/`concerto` above, and can be negative (a gauge-spending cast, e.g. -500).
   *  evaluate() banks this into `TeamMember.forte` automatically via addForte1-5, which floor at
   *  0 but impose no ceiling — a kit never touches its own gauge from inside an action, it just
   *  declares the delta per action, same as everywhere else in this shape. */
  forte1?: number;
  forte2?: number;
  forte3?: number;
  forte4?: number;
  forte5?: number;
  /** This cast empties the gauge — a Liberation that spends the whole bar, a form switch that
   *  clears it — whatever it held, without the kit having to declare the cap as a negative delta
   *  and clamp to it first. The gauge is set to 0 *ahead of* this cast's own `forteN` (and any
   *  AddForteN a buff adds), so a bare reset lands on 0 and a reset declaring `forte1: 200`
   *  lands on 200 (Suoming's Flash Rift: clear all Delusion, then the 200 it grants). */
  resetForte1?: boolean;
  resetForte2?: boolean;
  resetForte3?: boolean;
  resetForte4?: boolean;
  resetForte5?: boolean;
  /** A rotation marker rather than a real cast: `run()` calls this to get whichever action to
   *  actually evaluate in its place, with the "current" pointers already aimed at the acting slot
   *  (so it can read `currentMember()` etc. the same as any other kit logic). Every marker below
   *  that stands for a real cast — INTRO, the ECHO_* markers — is built on this, which
   *  is why the engine knows nothing about any of them by name. `null` means the marker resolved
   *  to no cast at all this step (it deferred itself onto a later one, say — see `queueOnIntro()`),
   *  and `run()` simply moves on. */
  resolve?: () => Action | null;
  /** A rotation marker that gates the entry written *after* it rather than standing for a cast of
   *  its own: true skips that entry (a whole ActionGroup, where that is what follows), false lets
   *  it play. The marker itself never lands. */
  skipNext?: () => boolean;
  /** How long this press's animation runs, in frames at 60 per second — `total_frames`, its
   *  `timestop` included. The fight clock (`State.frame`) advances by this less the time stop
   *  (`cancelCost()`, context.ts's `elapsed()`), and every buff duration and tick clock is measured
   *  against that. 0, the default, is a press that takes no time of the fight's own: a follow-up,
   *  a summon echo. One nothing has measured declares 60, the engine's one-second stand-in. */
  frames?: number;
  /** The frame this press can be cancelled from without losing any of its damage — its last hit,
   *  or wuwalab's earliest cancel where that comes later. Where a cancelled press is cut
   *  (`cancelCost()`). Unmeasured, it is the press's own `frames`: a cut there runs longer than the
   *  press, which `run()`'s length check throws on, so only an insta cut can be made. */
  cancelFrames?: number;
  /** The frames of `frames` the world stands still for (wuwalab's `time_stop`) — part of the
   *  animation, but none of the fight's time: `cancelCost()` takes it back off. */
  timestop?: number;
  /** The frames of `total_frames` the hit freezes the animation for (wuwalab's `motion_stop`).
   *  Shown in the Time hover only; the one clock that skips it is a tick declaring
   *  `skipMotionStop` (Suisui's dance). */
  motionStop?: number;
  /** The field this hit belongs to — a summon firing on its own beside the fight (a coordinated
   *  attack, Denia's Erosion Field, Jué's follow-up, Xiangli Yao's outro laser, Rebecca's turret).
   *  The same `ActionField` the Buff that opens the field names, which is what pairs a run of hits
   *  with the cast that created them (see `ActionField` below). A one-off reuse of a field's own
   *  hit outside it (Mortefi's S5 burst, Verina's S6 proc) leaves it off, or clears it with `null`
   *  on a variant of a hit that has one. */
  field?: ActionField | null;
  /** What pressing this draws on: a count of frames for a cooldown of its own, or a `Cooldown`
   *  shared with the casts that share it (Jinhsi's two skills, Buling's two Liberations). A
   *  rotation entry with no charge left waits it out first (`Cooldown.wait()`). */
  cooldown?: number | Cooldown;
  /** The length this cast puts a shared `cooldown` on, where the casts sharing it differ (Jinhsi's
   *  Trailing Lights 3s, Crescent Divinity 10s). The Cooldown's own `frames` otherwise. */
  cooldownFrames?: number;
  /** The one tag this action carries: how it is cut short, or that it plays beside the fight
   *  (`Field`). An Outro is always `Field`; everything else `Default` unless it says otherwise. */
  tag?: ActionTag;
}

export { ActionTag };

/** A press's frames as the clock charges them: the action up to its cut (its whole length when
 *  it runs out), less the world's time stop inside that, plus the cut — a plain, dodge or jump
 *  cancel's 12, a fast cancel's 6, an insta cut's 6; a swap's 12 are the handoff's (`run()`). An
 *  insta cut is made on the press and a field press lands beside the fight, so neither plays any of its own. */
export function cancelCost(a: Action, cut: ActionTag | null): { action: number; timestop: number; global: number; total: number } {
  const full = a.frames;
  const tag = cut ?? a.tag;
  const insta = tag === ActionTag.InstaCancel || tag === ActionTag.InstaDodge || tag === ActionTag.InstaJump || tag === ActionTag.InstaSwap;
  // a cut plays its cancel frame in place of its frames (0 where none is measured), never past its end
  const action = tag === ActionTag.Default ? full : tag === ActionTag.Field || insta ? 0 : Math.min(a.cancelFrames, full);
  const timestop = Math.min(a.timestop, action);
  // a swap's own frames are the handoff's (15), charged when the next resonator comes in (`run()`'s swap frames)
  const global = tag === ActionTag.InstaSwap || tag === ActionTag.SwapCancel ? 0 : insta || tag === ActionTag.EasyCancel ? 6 : tag === ActionTag.Cancel || tag === ActionTag.DodgeCancel || tag === ActionTag.JumpCancel ? 12 : 0;
  return { action, timestop, global, total: action - timestop + global };
}

export interface CooldownDef {
  /** Frames one charge takes to come back — a function where a sequence shortens it, read when
   *  that charge's recharge starts. */
  frames: number | (() => number);
  /** Charges held at most, and at the start of the fight — a function where a sequence adds one. */
  charges?: number | (() => number);
}

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
  /** The row a press on this stands behind while no charge is left: nothing but the frames. */
  wait(frames: number): Action {
    return new Action(`Wait ${(frames / 60).toFixed(2)}s`, { frames });
  }
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
  element: Attribute | null;
  type: Type | null;
  subtype: Subtype | null;
  cast: Cast | null;
  subcast: Cast | null;
  node: Node | null;
  scaling: Scaling | null;
  mv: number;
  /** Cast and hit together: what the press banks in all (`ActionDef.castEnergy` for the split). */
  energy: number;
  concerto: number;
  offtune: number;
  /** Which half of a press this plays, where it plays only one: its cast (a split press's cast
   *  half, an insta cut) banks only the cast's gains, its landing hit only the hit's. Null on a
   *  whole press, which banks both. */
  half: "cast" | "hit" | null = null;
  /** A dodge/jump cancel's cast half: the press up to its cut, none of its hooks — which are its
   *  hit's (`castPart()`), so it doesn't read as the press (`runningAction()`). */
  dashCast = false;
  /** The cast's own share of `energy` / `concerto` / forte1-5. */
  castEnergy: number;
  castConcerto: number;
  castForte: number[];
  slot: string | null;
  resetEnergy: boolean;
  forte1: number;
  /** forte1-5 as one array, for evaluate()'s banking loop. */
  forteDeltas: number[];
  forte2: number;
  forte3: number;
  forte4: number;
  forte5: number;
  /** `resetForte1`-`resetForte5` as one array, indexed the way `TeamMember.forte` is. */
  resetForte: [boolean, boolean, boolean, boolean, boolean];
  resolveFn?: () => Action | null;
  skipNextFn?: () => boolean;
  frames: number;
  cancelFrames: number;
  timestop: number;
  motionStop: number;
  cooldown: Cooldown | null;
  cooldownFrames: number;
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
    this.element = def.element ?? null;
    this.type = def.type ?? null;
    this.subtype = def.subtype ?? null;
    this.cast = def.cast ?? null;
    this.subcast = def.subcast ?? null;
    this.node = def.node ?? null;
    this.scaling = def.scaling ?? null;
    this.mv = def.mv ?? 0;
    // No default: an action that deals damage says what it multiplies, so a kit that forgets
    // fails here rather than silently scaling off ATK. Only a rotation marker (INTRO and
    // friends below), which carries no motion value, is allowed to leave it null.
    if (this.mv !== 0 && this.scaling === null) throw new Error(`${name}: an action with a motion value must declare its scaling`);
    // the Action's own fields hold cast and hit together — what a press banks in all
    this.castEnergy = def.castEnergy ?? 0;
    this.castConcerto = def.castConcerto ?? 0;
    this.energy = (def.energy ?? 0) + this.castEnergy;
    this.concerto = (def.concerto ?? 0) + this.castConcerto;
    this.offtune = def.offtune ?? 0;
    this.slot = def.slot ?? null;
    this.resetEnergy = def.resetEnergy ?? false;
    this.castForte = [def.castForte1 ?? 0, def.castForte2 ?? 0, def.castForte3 ?? 0, def.castForte4 ?? 0, def.castForte5 ?? 0];
    this.forte1 = (def.forte1 ?? 0) + this.castForte[0]!;
    this.forte2 = (def.forte2 ?? 0) + this.castForte[1]!;
    this.forte3 = (def.forte3 ?? 0) + this.castForte[2]!;
    this.forte4 = (def.forte4 ?? 0) + this.castForte[3]!;
    this.forte5 = (def.forte5 ?? 0) + this.castForte[4]!;
    this.forteDeltas = [this.forte1, this.forte2, this.forte3, this.forte4, this.forte5];
    this.resetForte = [!!def.resetForte1, !!def.resetForte2, !!def.resetForte3, !!def.resetForte4, !!def.resetForte5];
    this.resolveFn = def.resolve;
    this.skipNextFn = def.skipNext;
    this.frames = def.frames ?? 0;
    this.cancelFrames = def.cancelFrames ?? this.frames;
    this.timestop = def.timestop ?? 0;
    this.motionStop = def.motionStop ?? 0;
    this.tag = def.tag ?? (def.cast === Cast.Outro ? ActionTag.Field : ActionTag.Default);
    // a bare frame count becomes this cast's own Cooldown, written back so every variant and
    // cancelled form of it draws on the same one
    this.cooldown = typeof def.cooldown === "number" ? new Cooldown({ frames: def.cooldown }) : def.cooldown ?? null;
    this.def = typeof def.cooldown === "number" ? { ...def, cooldown: this.cooldown! } : def;
    this.cooldownFrames = def.cooldownFrames ?? 0;
  }

  /** What the clock charges this press cut short by `kind` (`cancelCost()`) — a method, so
   *  evaluate.ts reaches it through the type-only import it keeps on this module. */
  cost(cut: ActionTag | null): ReturnType<typeof cancelCost> { return cancelCost(this, cut); }
  /** Does this take its owner off the field — what "lost on swap" reads: an Outro or a swap. A
   *  FIELD press (a summon, a coordinated hit) lands beside the fight but moves nobody. */
  get swapOut(): boolean { return this.cast === Cast.Outro || this.tag === ActionTag.SwapCancel || this.tag === ActionTag.InstaSwap; }
  /** A swap cancel: its hit lands on field, so what is lost on swap still pays on it and goes after. */
  get swapsAfterHit(): boolean { return this.tag === ActionTag.SwapCancel; }

  /** The same cast again under `overrides` — every hook and number shared, but a new Action, so
   *  the two are told apart by identity wherever it matters (a Mainslot's off-field copy of its
   *  own hit, say). */
  variant(name: string, overrides: ActionDef): Action {
    return new Action(name, { ...this.def, ...overrides });
  }

  /** This cast cut at its cancel frame — its hit lands, and the clock charges `cancelCost()`.
   *  The same Action runs, so every `===` a kit makes against it still holds. */
  cancel(): Action { return new CancelledStep(this, ActionTag.Cancel); }
  /** The same, cut perfectly on its cancel frame — 6 frames after it rather than a plain cancel's 12. */
  easyCancel(): Action { return new CancelledStep(this, ActionTag.EasyCancel); }
  /** The same, cut by a dash: a group of this press and the dash after it (`dashed()`). */
  dodgeCancel(): Action { return dashed(this, ActionTag.DodgeCancel); }
  /** The same, cut by a jump. */
  jump(): Action { return dashed(this, ActionTag.JumpCancel); }

  /** This cast cancelled the moment it is pressed — its own effects (the hooks, the cast tags) with
   *  none of its hit: no motion value, element, types, scaling, or energy/concerto/off-tune/forte. */
  instaCancel(): Action { return this.instaForm(ActionTag.InstaCancel); }
  /** The same, the press cut by a dash, which follows it (`dashed()`). */
  instaDodge(): Action { return dashed(this, ActionTag.InstaDodge); }
  /** The same, the press cut by a jump. */
  instaJump(): Action { return dashed(this, ActionTag.InstaJump); }

  /** The insta forms, pointed back at the cast they cancel so `runningAction()` still reads the two
   *  as one: the cast's own effects with none of its hit — unless its hit lands inside the 6 frames
   *  an insta cut takes anyway (a cancel frame of 6 or less), when it keeps the whole press. */
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
    const d = this.def;
    const out = this.cancelFrames <= 6 ? this.variant(this.name, { tag: kind }) : new Action(this.name, {
      cast: d.cast, cooldown: d.cooldown, cooldownFrames: d.cooldownFrames, tag: kind,
      // the hit is lost, the cast's own banking stands
      castEnergy: d.castEnergy, castConcerto: d.castConcerto,
      castForte1: d.castForte1, castForte2: d.castForte2, castForte3: d.castForte3, castForte4: d.castForte4, castForte5: d.castForte5,
      combatStart: d.combatStart, updateDebuffs: d.updateDebuffs, updateGlobal: d.updateGlobal, updateBuffs: d.updateBuffs,
      applyStats: d.applyStats, convertStats: d.convertStats, afterAction: d.afterAction, lateConvertStats: d.lateConvertStats,
      display: d.display,
    });
    out.cancelOf = this;
    // an insta cut that lost its hit is its cast alone
    if (this.cancelFrames > 6) out.half = "cast";
    (this.hitlessForms ??= new Map()).set(kind, out);
    return out;
  }

  /** Does this press's hit land after its cast — an Outro or an insta swap (its owner gone by
   *  then), a FIELD summon whose frames are the time its hit takes, or a dodge/jump cancel, whose
   *  dash is made before the hit is in? `run()` then casts `castPart()` and lands `hitPart()` later.
   *  A swap cancel's hit lands on field, before it swaps. */
  splitsHit(cut: ActionTag | null): boolean {
    const tag = cut ?? this.tag;
    return this.mv > 0 && (this.cast === Cast.Outro || tag === ActionTag.InstaSwap || dashCut(tag) || (tag === ActionTag.Field && this.frames > 0));
  }
  /** Does the split hit land with its owner off the field — an Outro's or an insta swap's, not a
   *  summon's, which lands wherever the field then stands. */
  hitsAway(cut: ActionTag | null): boolean {
    return this.cast === Cast.Outro || (cut ?? this.tag) === ActionTag.InstaSwap;
  }
  /** Frames from the cast to its hit: an outro's or a summon's whole animation, an insta swap's
   *  cancel frame (its last hit), less any time stop either way — a dodge/jump cancel's its cancel
   *  frame too, none of the cut's own frames (`run()` holds it until the dash has played). */
  hitDelay(cut: ActionTag | null = null): number {
    if (dashCut(cut ?? this.tag)) {
      const c = this.cost(cut);
      return Math.max(0, c.action - c.timestop);
    }
    const at = this.tag === ActionTag.InstaSwap ? Math.min(this.cancelFrames, this.frames) : this.frames;
    return Math.max(0, at - this.timestop);
  }
  private castCopy?: Action;
  private dashCastCopy?: Action;
  private dashHitCopy?: Action;
  private hitCopy?: Action;
  /** The leaving half of a split press: everything but the hit — its spend, its hand-offs, the swap.
   *  A dodge/jump cancel's plays its own frames to the cut; every other takes none. */
  castPart(cut: ActionTag | null = null): Action {
    if (dashCut(cut ?? this.tag)) {
      if (!this.dashCastCopy) {
        // the press up to its cut, what its cast banks and its cast hooks (`updateBuffs`); its hit's
        // own (`updateDebuffs`, the stat phases) wait for the hit
        this.dashCastCopy = this.variant(this.name, {
          mv: 0, energy: 0, offtune: 0, concerto: 0, forte1: 0, forte2: 0, forte3: 0, forte4: 0, forte5: 0,
          updateDebuffs: undefined, applyStats: undefined, convertStats: undefined,
          lateConvertStats: undefined, afterAction: undefined,
        });
        this.dashCastCopy.formOf = this;
        this.dashCastCopy.half = "cast";
        this.dashCastCopy.dashCast = true;
      }
      return this.dashCastCopy;
    }
    if (!this.castCopy) {
      const d = this.def;
      // a cast leaves the moment it is pressed: its frames are the hit's to wait out
      // the cast's own share of what the press banks, none of the hit's
      this.castCopy = this.variant(this.name, {
        mv: 0, energy: 0, offtune: 0, concerto: 0, forte1: 0, forte2: 0, forte3: 0, forte4: 0, forte5: 0,
        updateDebuffs: undefined, frames: 0, cancelFrames: 0, timestop: 0,
      });
      this.castCopy.formOf = this;
      this.castCopy.half = "cast";
    }
    return this.castCopy;
  }
  /** The landing half: the hit alone, off field — its damage, what it banks, what it inflicts. */
  hitPart(cut: ActionTag | null = null): Action {
    if (dashCut(cut ?? this.tag)) {
      // a dodge/jump cancel's hit is the press's own, landed after the dash: its hit hooks
      // (`updateDebuffs`, the stat phases) but not its cast's (`updateBuffs`), playing no frames
      if (!this.dashHitCopy) {
        const d = this.def;
        this.dashHitCopy = new Action(this.name, {
          element: d.element, type: d.type, subtype: d.subtype, node: d.node, scaling: d.scaling, mv: d.mv,
          energy: d.energy, offtune: d.offtune, concerto: d.concerto, field: d.field,
          forte1: d.forte1, forte2: d.forte2, forte3: d.forte3, forte4: d.forte4, forte5: d.forte5,
          updateDebuffs: d.updateDebuffs, applyStats: d.applyStats, convertStats: d.convertStats,
          lateConvertStats: d.lateConvertStats, afterAction: d.afterAction,
        });
        this.dashHitCopy.formOf = this;
        this.dashHitCopy.half = "hit";
      }
      return this.dashHitCopy;
    }
    if (!this.hitCopy) {
      const d = this.def;
      this.hitCopy = new Action(this.name, {
        element: d.element, type: d.type, subtype: d.subtype, node: d.node, scaling: d.scaling, mv: d.mv,
        energy: d.energy, offtune: d.offtune, concerto: d.concerto, field: d.field,
        forte1: d.forte1, forte2: d.forte2, forte3: d.forte3, forte4: d.forte4, forte5: d.forte5,
        applyStats: d.applyStats, updateDebuffs: d.updateDebuffs, tag: ActionTag.Field,
      });
      this.hitCopy.formOf = this;
      this.hitCopy.half = "hit";
    }
    return this.hitCopy;
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

  /** The same cast made on the way out, under its own name and a SWAP CANCEL tag — identical in
   *  every field, but a swap-out: it plays to its cancel frame, its hit landing on field, and swaps
   *  out after it (the handoff's 15 swap frames, `run()`). */
  swapCancel(): Action {
    const out = this.variant(this.name, { tag: ActionTag.SwapCancel });
    out.formOf = this;
    return out;
  }
  /** The same cast swapped out of the moment it is pressed — the handoff's 15 frames — its hit still landing,
   *  off field, once the press would have reached it (`splitsHit()`). */
  instaSwap(): Action {
    const out = this.variant(this.name, { tag: ActionTag.InstaSwap });
    out.formOf = this;
    return out;
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
  override easyCancel(): Action { return this.withLast((a) => a.easyCancel()); }
  override dodgeCancel(): Action { return this.dashLast((a) => a.dodgeCancel()); }
  override jump(): Action { return this.dashLast((a) => a.jump()); }
  override instaCancel(): Action { return this.withLast((a) => a.instaCancel()); }
  override instaDodge(): Action { return this.dashLast((a) => a.instaDodge()); }
  override instaJump(): Action { return this.dashLast((a) => a.instaJump()); }
  override swapCancel(): Action { return this.withLast((a) => a.swapCancel()); }
  override instaSwap(): Action { return this.withLast((a) => a.instaSwap()); }
  private withLast(cut: (a: Action) => Action): ActionGroup {
    return new ActionGroup(this.name, [...this.actions.slice(0, -1), cut(this.actions[this.actions.length - 1]!)]);
  }
  /** The last press's dash group, flattened into this one — `run()` expands a single level. */
  private dashLast(cut: (a: Action) => Action): ActionGroup {
    const tail = cut(this.actions[this.actions.length - 1]!) as ActionGroup;
    return new ActionGroup(this.name, [...this.actions.slice(0, -1), ...tail.actions], tail.trailing);
  }
}

/** A cut that makes a dash or jump after the press (not an insta one, which has no hit to wait on). */
const dashCut = (tag: ActionTag | null): boolean => tag === ActionTag.DodgeCancel || tag === ActionTag.JumpCancel;

/** A dash or jump cutting `after` short: the press as cut, then the dash itself as a press of
 *  its own — which dash is the resonator's (`DashMarker`). Folds into one row reading the press;
 *  opened, the dash is the row under it. */
function dashed(after: Action, kind: ActionTag): ActionGroup {
  const insta = kind === ActionTag.InstaDodge || kind === ActionTag.InstaJump;
  const cut = insta ? after.instaForm(kind) : new CancelledStep(after, kind);
  const jump = kind === ActionTag.JumpCancel || kind === ActionTag.InstaJump;
  // a marker's group is named for what it resolves to, row by row (teamrun.ts's `toLines`)
  return new ActionGroup(after.resolveFn ? "" : after.name, [cut, new DashMarker(jump, after)], 1);
}


/** The plain dash and jump — what a resonator without one of its own makes (`ResonatorDef.dodge`). */
export const DODGE = new Action("Dodge", { frames: 22 });
export const JUMP = new Action("Jump", { frames: 15 });

/** The dash (or jump) a `dodge()`/`jump()` cut makes after `after`, resolved when reached the way
 *  INTRO is: the resonator's own for that press (Jingran's Shadow Step, Galbrena's Hellstride),
 *  else the plain one. Cut to an insta cancel by `run()` where the next press stops time. */
export class DashMarker extends Action {
  constructor(isJump: boolean, readonly after: Action) {
    super(isJump ? "Jump Placeholder" : "Dodge Placeholder", {
      resolve: () => {
        // a summon echo leaves its wearer nothing to cancel, nor does one short enough to press whole: no dash at all
        const mainslot = currentMember().mainslot;
        if (after === ECHO && mainslot && (mainslot.onfield === mainslot.outro || echoPressedWhole(mainslot))) return null;
        const resonator = currentMember().resonator;
        const pressed = after === INTRO ? resonator?.intro ?? after : after;
        return (isJump ? resonator?.jumpFn?.(pressed) : resonator?.dodgeFn?.(pressed)) ?? (isJump ? JUMP : DODGE);
      },
    });
  }
}

/** A rotation step that plays `of` itself cut short by `kind` — `run()` unwraps it, so the press
 *  is the very Action the kit declared and only its frames and its row's tag differ. */
export class CancelledStep extends Action {
  constructor(readonly of: Action, readonly kind: ActionTag) {
    super(of.name);
  }
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
 *  One marker per team position, and a section only ever plays for the position it names: START_1
 *  for the member standing first, START_2 second, START_3 third. What a resonator does in the
 *  fight's first seconds depends on where they stand — the leader opens the fight, the third
 *  member is usually banking something for a visit that is still two swaps away — and the same
 *  loadout sits in different positions in different teams, so one section that fired wherever they
 *  stood could only ever describe one of those. A rotation may declare one section per position,
 *  and the ones whose position this member isn't standing in are skipped whole, contents and all.
 *
 *  The three ignore each other: a marker opens a section alongside whatever is already open rather
 *  than closing it, so markers written back to back share one body — `START_2, START_3,
 *  Skill.swap()` is one section that reads the same from either position — and one written part-way
 *  through takes only the casts after it.
 *
 *  A section closes on a cast's `.swap()`, and sits on its own ahead of the chains — never inside
 *  one. */
export const START_1 = new Action("Start of Combat (1st)");
export const START_2 = new Action("Start of Combat (2nd)");
export const START_3 = new Action("Start of Combat (3rd)");

/** The three above by the position each names, and the reverse lookup — which position a marker
 *  opens a section for, or -1 for anything that isn't one. */
const STARTS = [START_1, START_2, START_3];
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
    const intro = currentMember().resonator?.intro;
    if (!intro) throw new Error(`${currentMember().name} casts INTRO but their Resonator declares no intro`);
    return intro.resolveFn ? intro.resolveFn() : intro;
  },
});

/** Chain entries by team position: the Intro chain this resonator plays instead of the main one
 *  while they stand first, second or third (the positions START_1/2/3 name) — written as the
 *  marker (then INTRO, if the Intro it casts is cut), then the chain, closed by an outro of its own; from any other
 *  position it is simply never played, and a position with none plays the main chain. A
 *  FIRST_INTRO chain still takes the first arrival. */
const introAt = (n: number): Action => new Action(`Intro (${["1st", "2nd", "3rd"][n]})`);
export const INTRO_1 = introAt(0);
export const INTRO_2 = introAt(1);
export const INTRO_3 = introAt(2);
const INTROS = [INTRO_1, INTRO_2, INTRO_3];
const introPosition = (action: Action): number => INTROS.indexOf(action);

/** The same for the NOINTRO chain: the no-Intro visit this resonator plays from one position
 *  rather than from any — leading, that is the fight's opening visit; second or third, it is the
 *  fill a swap-form double Intro hands back to (see DOUBLE_INTRO). Closed by an OUTRO of its own,
 *  or run into the INTRO chain or its own position's INTRO_n chain to share that chain's tail,
 *  exactly as NOINTRO may. A position with none plays the NOINTRO chain. */
export const NOINTRO_1 = new Action("No Intro (1st)");
export const NOINTRO_2 = new Action("No Intro (2nd)");
export const NOINTRO_3 = new Action("No Intro (3rd)");
const NOINTROS = [NOINTRO_1, NOINTRO_2, NOINTRO_3];
const nointroPosition = (action: Action): number => NOINTROS.indexOf(action);

/** A marker resolving to one form of the equipped mainslot echo. */
const echoForm = (name: string, written: string, pick: (m: Mainslot) => Action): Action => new Action(name, {
  resolve: () => {
    const mainslot = currentMember().mainslot;
    if (!mainslot) throw new Error(`${currentMember().name} casts ${written} but has no Mainslot equipped`);
    return pick(mainslot);
  },
});
const ECHO_SWAP_FORM = echoForm("Echo Placeholder (swap)", "ECHO.swap()", (m) => m.outro);
/** Is the equipped echo no longer than its wearer's own dash out of it plus an insta cut — pressed
 *  whole rather than dashed out of (`ECHO.instaDodge()`)? */
const echoPressedWhole = (m: Mainslot): boolean =>
  m.onfield.frames <= (currentMember().resonator?.dodgeFn?.(ECHO) ?? DODGE).frames + 6;
const ECHO_INSTA_FORM = echoForm("Echo Placeholder (insta dash)", "ECHO.instaDodge()", (m) => (echoPressedWhole(m) ? m.onfield : m.cancel));
const ECHO_INSTA_SWAP_FORM = echoForm("Echo Placeholder (insta swap)", "ECHO.instaSwap()", (m) => m.instaOut);

/** ECHO's own class: its swap and insta dash are the mainslot's own forms; every other cut is an
 *  ordinary step, which a summon (a hit its creature lands) never takes. */
class EchoMarker extends Action {
  override swapCancel(): Action { return ECHO_SWAP_FORM; }
  override instaSwap(): Action { return ECHO_INSTA_SWAP_FORM; }
  override instaDodge(): Action { return new ActionGroup("", [ECHO_INSTA_FORM, new DashMarker(false, this)], 1); }
}

/** The "cast the equipped mainslot echo here" marker — every build equips exactly one, so a
 *  rotation names the slot rather than the echo, and says *how* it is pressed. What lands is the
 *  echo's own business (gear.ts's `Mainslot`, by its action's frames): a SUMMON is the same follow-up hit
 *  every way, reported as triggered (`run()`), and never cut; a TRANSFORM is a press of the resonator's own —
 *  ECHO the full cast, cut like any other (`ECHO.dodgeCancel()`), `ECHO.instaDodge()` the cast
 *  dash-cancelled before it lands (its effects, none of its hit), and `ECHO.swap()` the cast made on
 *  the way out: `Action.swap()`'s swap-out form, resolved right where it stands. */
export const ECHO: Action = new EchoMarker("Echo Placeholder (on field)", {
  resolve: () => {
    const mainslot = currentMember().mainslot;
    if (!mainslot) throw new Error(`${currentMember().name} casts ECHO but has no Mainslot equipped`);
    return mainslot.onfield;
  },
});

/** Written immediately before a cast: that cast plays every other time this marker is reached, and
 *  is skipped in between — play, skip, play, skip. The count is the member's own and runs across
 *  every EVERY_OTHER in their rotation rather than per row, so a START section's copy takes the
 *  first play and the loops alternate on from there: play (start), skip, play, skip, play. For a
 *  cast a rotation lists every visit that the kit can only pay for on half of them. */
export const EVERY_OTHER = new Action("Every Other", {
  skipNext: () => ++currentMember().everyOther % 2 === 0,
});

/** The DOUBLE_INTRO section's entry, as the scheduler reads it. Written as the DOUBLE_INTRO marker,
 *  which casts INTRO (or the cut one written right after it, like FIRST_INTRO): a second Intro this
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
export const FIRST_INTRO = new Action("First Intro");

/** The no-Intro chain's own first-arrival form: played in place of NOINTRO the one time a
 *  resonator arrives having never played, and only then — a leader's opening visit, or the first
 *  time a swap-out hands them the field. Every arrival after takes the ordinary NOINTRO chain. It
 *  is what FIRST_INTRO is for the other entry: a kit whose opening visit has something the loop
 *  hasn't (Hiyuki's fourth Iai, bought by being out of combat) writes it once here. Closed by an
 *  OUTRO of its own, or run into the FIRST_INTRO chain to share that chain's tail, exactly as
 *  NOINTRO may run into INTRO. */
export const NOINTRO_FIRST = new Action("First No Intro");


/** A chain's exit when it leaves on its last cast's `.swap()` rather than an Outro — never
 *  written or played, only compared: the cast already left, and the next slot plays their NOINTRO
 *  chain, which they must declare. */
const SWAP_EXIT = new Action("Swap");

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

/** A resonator's rotation, compiled into the ways they can arrive. Only `intro` is required: a
 *  resonator with no start-of-combat section for the position they stand in sits out the fight's
 *  opening scramble, one with no
 *  NOINTRO chain simply can't lead a team, and `doubleIntro` marks the pre-Intro visit a
 *  DOUBLE_INTRO section declares (see `runRotations()`). */
export class Rotation {
  /** What each start-of-combat section holds, by the team position it is for (START_1/2/3) —
   *  body only, closing cast included. `null` at a position this rotation declares no section for, which is most of them. */
  startCombat: (Action[] | null)[] = [null, null, null];
  opener: Chain | null = null;
  intro: Chain;
  /** The DOUBLE_INTRO section: `exit` is SWAP_EXIT for the swap-back form (its last cast's
   *  `.swap()`, running into the Intro) or its outro for the outro-back form. */
  doubleIntro: Chain | null = null;
  /** The FIRST_INTRO chain, played in place of `intro` on this resonator's first arrival. */
  firstIntro: Chain | null = null;
  /** The NOINTRO_FIRST chain, played in place of `opener` on that same first arrival. */
  firstOpener: Chain | null = null;
  /** The INTRO_1/2/3 chains, each played in place of `intro` while this resonator stands in that
   *  position, and the NOINTRO_1/2/3 chains likewise in place of `opener`. */
  intros: (Chain | null)[] = [null, null, null];
  openers: (Chain | null)[] = [null, null, null];

  constructor(actions: Action[]) {
    // `intro@n` / `opener@n` are the per-position chains' own phases
    let phase: "none" | "opener" | "double" | "intro" | "first" | "firstOpener" | `intro@${number}` | `opener@${number}` = "none";
    const prefix: Action[] = [], loop: Action[] = [], dbl: Action[] = [], first: Action[] = [], firstPre: Action[] = [];
    const loops: Action[][] = [[], [], []], prefixes: Action[][] = [[], [], []];
    // which positions' start-of-combat sections are open — more than one where the markers were
    // written back to back, which is how a section that reads the same from two positions is
    // spelled (`START_2, START_3, Skill.swap()`) — and what each has collected
    let inStart: number[] = [];
    const starts: (Action[] | null)[] = [null, null, null];
    const body = (): Action[] | null =>
      (phase === "opener" ? prefix : phase === "intro" ? loop : phase === "double" ? dbl : phase === "first" ? first
        : phase === "firstOpener" ? firstPre
        : phase.startsWith("intro@") ? loops[Number(phase.slice(6))]! : phase.startsWith("opener@") ? prefixes[Number(phase.slice(7))]! : null);
    // set when the NOINTRO chain ran into the INTRO marker rather than an outro of its own, which
    // is what makes the two share everything from there down
    let shared = false;
    // ...and the same for a NOINTRO chain that ran into DOUBLE_INTRO instead (see that branch)
    let sharedDouble = false;
    // ...and for a NOINTRO_FIRST chain that ran into FIRST_INTRO, the first-arrival pair sharing
    // their tail exactly as NOINTRO and INTRO do
    let sharedFirst = false;
    let openerExit: Action | null = null, introExit: Action | null = null, doubleExit: Action | null = null;
    let firstExit: Action | null = null, firstOpenerExit: Action | null = null;
    const introExits: (Action | null)[] = [null, null, null], openerExits: (Action | null)[] = [null, null, null];
    // what each NOINTRO_n chain ran into rather than closing on an outro: the INTRO chain
    // ("main") or its own position's INTRO_n chain (n)
    const sharedInto: ("main" | number | null)[] = [null, null, null];

    // OUTRO or SWAP_EXIT ending whichever chain is open
    const close = (action: Action): void => {
      if (phase === "opener") { openerExit = action; phase = "none"; }
      else if (phase === "intro") { introExit = action; phase = "none"; }
      else if (phase === "double") { doubleExit = action; phase = "none"; }
      else if (phase === "first") { firstExit = action; phase = "none"; }
      else if (phase === "firstOpener") { firstOpenerExit = action; phase = "none"; }
      else if (phase.startsWith("intro@")) { introExits[Number(phase.slice(6))] = action; phase = "none"; }
      else if (phase.startsWith("opener@")) { openerExits[Number(phase.slice(7))] = action; phase = "none"; }
      else throw new Error(`rotation: ${action.name} closes a chain that was never opened`);
    };

    // the Intro each chain opens with, as written; a FIRST_INTRO / INTRO_n marker takes the one
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
      // a marker that casts INTRO, cut (`INTRO_3.easyCancel()`), is that marker and the INTRO it casts, cut
      if (step && (bare === FIRST_INTRO || bare === DOUBLE_INTRO || introPosition(bare) >= 0)) {
        entries.unshift(bare, new CancelledStep(INTRO, step.kind));
        continue;
      }
      const action = written;
      if (isIntro(written) && introOf(written) !== INTRO) throw new Error(`rotation: write INTRO, not ${introOf(written).name}`);
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
      } else if (action === FIRST_INTRO) {
        if (firstExit || first.length) throw new Error("rotation: only one FIRST_INTRO chain");
        castFor = "first";
        // the walk-through: a FIRST_INTRO reached inside an open NOINTRO_FIRST chain isn't cast, it
        // just marks where the tail the two share begins
        if (phase === "firstOpener") sharedFirst = true;
        else if (phase !== "none") throw new Error("rotation: FIRST_INTRO opens a chain while one is still open");
        phase = "first";
      } else if (action === NOINTRO_FIRST) {
        if (firstOpenerExit || firstPre.length || sharedFirst) throw new Error("rotation: only one NOINTRO_FIRST chain");
        if (phase !== "none") throw new Error("rotation: NOINTRO_FIRST opens a chain while one is still open");
        phase = "firstOpener";
      } else if (nointroPosition(action) >= 0) {
        const n = nointroPosition(action);
        if (openerExits[n] || prefixes[n]!.length || sharedInto[n] !== null) throw new Error(`rotation: only one ${action.name} chain`);
        if (phase !== "none") throw new Error(`rotation: ${action.name} opens a chain while one is still open`);
        phase = `opener@${n}`;
      } else if (introPosition(action) >= 0) {
        const n = introPosition(action);
        castFor = `intro@${n}`;
        if (introExits[n] || loops[n]!.length) throw new Error(`rotation: only one ${action.name} chain`);
        // a NOINTRO_n chain running into its own position's INTRO_n shares the tail from there
        if (phase === `opener@${n}`) sharedInto[n] = n;
        else if (phase !== "none") throw new Error(`rotation: ${action.name} opens a chain while one is still open`);
        phase = `intro@${n}`;
      } else if (isIntro(action)) {
        // an Intro inside an already-open Intro chain is a cast, not a chain boundary — Camellya's
        // double Intro
        if (phase === "intro" || phase === "first") { body()!.push(written); continue; }
        if (phase.startsWith("intro@")) { loops[Number(phase.slice(6))]!.push(written); continue; }
        if (introExit) throw new Error("rotation: only one Intro chain");
        cuts.set("intro", written);
        // the walk-through: an INTRO reached inside an open NOINTRO chain isn't cast, it just marks
        // where the tail the two share begins — a NOINTRO_n chain shares the same way
        if (phase === "opener") shared = true;
        if (phase.startsWith("opener@")) sharedInto[Number(phase.slice(7))] = "main";
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
    // a rotation written only for named positions (INTRO_2/INTRO_3, a fixed-slot sub-DPS) has no
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
    // an Intro chain's entry, not FIRST_INTRO: it is an Intro chain in every way the scheduler
    // cares about, and only which visit plays it differs
    if (firstExit) this.firstIntro = { entry: INTRO_ENTRY, cast: cuts.get("first"), body: first, exit: firstExit };
    // entry NOINTRO for the same reason the one above is INTRO: it arrives the way an opener does,
    // and only which visit plays it differs
    if (firstOpenerExit || sharedFirst) {
      this.firstOpener = { entry: NOINTRO, body: sharedFirst ? [...firstPre, ...first] : firstPre, exit: firstOpenerExit ?? firstExit! };
    } else if (firstPre.length) {
      throw new Error("rotation: the NOINTRO_FIRST chain is closed by neither an outro nor a FIRST_INTRO");
    }
    this.intro = { entry: INTRO_ENTRY, cast: cuts.get("intro") ?? cuts.get(`intro@${stand}`), body: loop, exit: introExit };
    for (const n of [0, 1, 2]) {
      const exit = introExits[n];
      if (exit) this.intros[n] = { entry: INTRO_ENTRY, cast: cuts.get(`intro@${n}`), body: loops[n]!, exit };
      const into = sharedInto[n];
      if (openerExits[n]) this.openers[n] = { entry: NOINTRO, body: prefixes[n]!, exit: openerExits[n]! };
      else if (into === "main") this.openers[n] = { entry: NOINTRO, body: [...prefixes[n]!, ...loop], exit: introExit };
      else if (into !== null) {
        if (!exit) throw new Error(`rotation: the ${NOINTROS[n]!.name} chain runs into ${INTROS[n]!.name}, which is never closed`);
        this.openers[n] = { entry: NOINTRO, body: [...prefixes[n]!, ...loops[n]!], exit };
      } else if (prefixes[n]!.length) throw new Error(`rotation: the ${NOINTROS[n]!.name} chain is closed by neither an outro nor an Intro`);
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
  isIntro(a) || [NOINTRO, NOINTRO_FIRST, FIRST_INTRO, DOUBLE_INTRO, ...NOINTROS, ...INTROS].includes(a);
const unstep = (a: Action): [Action, CancelledStep | null] => (a instanceof CancelledStep ? [a.of, a] : [a, null]);

/** Does this entry leave the field — a cast's `swap()` / `instaSwap()` form, the echo's, or a group
 *  ending on one? What closes a start-of-combat section. */
function leavesField(a: Action): boolean {
  const last = a instanceof ActionGroup ? a.actions[a.actions.length - 1]! : a;
  if (last === ECHO_SWAP_FORM || last === ECHO_INSTA_SWAP_FORM) return true;
  return (last.tag === ActionTag.SwapCancel || last.tag === ActionTag.InstaSwap) && (last.formOf ?? last.cancelOf) !== null;
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
 * team order, then every main visit in team order (Suoming > Hsin > Jinhsi reads Suo1 Hsin1 Jin1
 * Suo2 Hsin2 Jin2), the opener standing in for the leader's first pre-visit.
 *
 * A section closes on the Intro the *last* slot's own Outro hands into — one full trip round the
 * team, ending where the next begins. The outro's own follow-ups, that Intro, and whatever the
 * Intro itself queued all belong to the section they close; the first rotation cast of the visit
 * opens the next one. Trips go on until the fight's clock passes `untilFrame`; the caller cuts the
 * last of them where the time runs out (teamrun.ts).
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
  // a slot's own no-Intro chain: the one written for the position it stands in, else the plain one
  const openerChain = (i: number): Chain | null => rotations[i]!.openers[i] ?? rotations[i]!.opener ?? rotations[i]!.firstOpener;
  if (!openerChain(0)) return `${names[0]} leads the team but declares no NOINTRO chain`;
  for (let i = 0; i < rotations.length; i++) {
    const r = rotations[i]!, nxt = (i + 1) % rotations.length;
    if ([r.intros[i] ?? r.intro, r.firstIntro, r.firstOpener, openerChain(i)].some((c) => c?.exit === SWAP_EXIT) && !openerChain(nxt)) {
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

export function runRotations(state: State, rotations: Rotation[], untilFrame: number): Result[][] {
  const why = teamPlayable(rotations, state.slots.map((s) => s.name));
  if (why) throw new Error(why);
  // Whoever has already played, and so which of the two forms of a chain an arrival takes: the
  // first-arrival ones are the chain a resonator plays the one time they turn up having never
  // acted, whichever entry that arrival uses.
  const visited = new Set<number>();
  // a slot's own no-Intro chain: its first-arrival form, else the one written for the position it
  // stands in, else the plain one
  const openerChain = (i: number): Chain | null => {
    const r = rotations[i]!;
    const main = r.openers[i] ?? r.opener;
    return !visited.has(i) && r.firstOpener ? r.firstOpener : main ?? r.firstOpener;
  };
  const last = state.slots.length - 1;
  const out: Result[][] = [[]];
  let section = 0;
  // another visit is due while the clock has not yet passed the fight's end
  const going = (): boolean => state.frame <= untilFrame;

  // The section the last slot has just outro'd out of ends with that visit — its outro and every
  // follow-up the outro queued behind it: `closing` says the next rows to land open the next
  // section, starting at the incoming Intro.
  let closing = false;
  // How many frames are waiting for the field to come back for a main visit of their own (see
  // `visit()`), and a section-closing trip that finished while one was. The last slot's own outro
  // is what ends a trip round the team, but its visit can run *inside* another slot's wait — the
  // DPS half of a double-Intro pair, whose partner still owes a main visit — and cutting there
  // would leave that partner's own visit to open the next section. So it is held until the wait
  // it ran inside is over.
  let awaiting = 0, closePending = false;
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
    }
    out[section]!.push(...snaps);
  };

  // A FIRST_INTRO chain stands in for the ordinary one until this slot has played at all — the
  // same `visited` the no-Intro pair reads, so a leader's opening visit spends whichever
  // first-arrival chain it enters on rather than leaving the other standing for the next.
  const introChain = (i: number): Chain => {
    const r = rotations[i]!;
    // the chain written for the position this slot stands in, where there is one
    const main = r.intros[i] ?? r.intro;
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

  const runChain = (i: number, chain: Chain): void => {
    state.active = i;
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
    const exit = swapped ? [] : [chain.exit];
    const list = chain.entry === INTRO_ENTRY || chain.entry === DOUBLE_ENTRY ? [chain.cast!, ...casts, ...exit] : [...casts, ...exit];
    const snaps = run(state, list);
    state.outroDir = 1;
    // an Outro row advances the field itself (evaluate.ts); a swap hands it forward here
    if (swapped) state.active = (i + 1) % rotations.length;
    place(snaps);
    // one full trip round the team is done — the section ends on this outro, and the Intro it
    // hands into opens the next (see `place()`). A double-Intro visit never closes one: its
    // owner's main outro does.
    if (i === last && chain.entry !== DOUBLE_ENTRY) {
      if (awaiting) closePending = true; else closing = true;
    }
  };

  // the fight's own first seconds — everyone who declares a section for them, in team order, each
  // swapping into the next; the last hands over to slot 1, whose opener starts the rotation cycle
  const starters: number[] = [];
  rotations.forEach((r, i) => { if (r.startCombat[i]) starters.push(i); });
  for (let k = 0; k < starters.length; k++) {
    const i = starters[k]!;
    const next = starters[k + 1] ?? 0;
    state.active = i;
    // the section leaves on its own last cast's swap form; with nobody to swap to, the resonator
    // carries straight on and that cast stays on field
    const opening = rotations[i]!.startCombat[i]!;
    const last = opening[opening.length - 1]!;
    const chain = next === i && leavesField(last) ? [...opening.slice(0, -1), staysOnField(last)] : opening;
    out[section]!.push(...run(state, chain));
    state.active = next;
  }

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
    const d = mained.size && !mained.has(nxt) && !paired ? rotations[nxt]!.doubleIntro : undefined;
    if (d && !doubled.has(nxt)) {
      doubled.add(nxt);
      if (d.exit !== SWAP_EXIT) {
        runChain(nxt, d); // its outro hands straight back here; fall through to the normal visit
        giver = nxt;
      } else {
        state.active = nxt;
        // the section's last cast leaves on its `.swap()`, back to the slot it came from
        state.outroDir = -1;
        place(run(state, [d.cast!, ...d.body]));
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
    const own = mained.size ? rotations[i]!.doubleIntro : undefined;
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
  }

  // A leader with a double Intro of their own: pre-visits in team order, then main visits in team
  // order (see the header). Outro-form sections only — a swap-back form leans on the previous
  // slot's NOINTRO fill, which this shape has no place for.
  if (rotations[0]!.doubleIntro) {
    let first = true, trips = 0;
    while (going()) {
      if (++trips > 1000) throw new Error("rotation scheduler never reached the end of the fight");
      // the opener already stood in for the leader's first pre-visit
      for (let i = first ? 1 : 0; i < rotations.length && going(); i++) {
        const d = rotations[i]!.doubleIntro;
        if (d) runChain(i, d);
      }
      first = false;
      for (let i = 0; i < rotations.length && going(); i++) runChain(i, arrival(i));
    }
    return out;
  }

  let guard = 0;
  while (going()) {
    if (++guard > 1000) throw new Error("rotation scheduler never reached the end of the fight");
    visit(state.active);
  }
  // hits still in flight when the fight ends land then
  if (state.timed.length) out[out.length - 1]!.push(...run(state, [], true));
  return out;
}
