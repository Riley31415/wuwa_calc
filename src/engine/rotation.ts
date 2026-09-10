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
 *     INTRO, Liberation, WBA1, WBA2, ECHO_SWAP, OUTRO, // every visit after
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
 * time, and the rest are read by the compiler here and never reach `evaluate()`. `SWAP` doubles as
 * both: a kit writes it only to close a start-of-combat section, and the engine emits the real swap
 * rows itself.
 */
import { Gear } from "./gear.js";
import { run } from "./evaluate.js";
import { currentMember, queue, isCast } from "./context.js";
import type { GearDef } from "./gear.js";
import type { State } from "./state.js";
import type { Result } from "./evaluate.js";
import { Cast } from "./stats.js";
import type { Attribute, Type1, Type2, Node, Scaling } from "./stats.js";

/* ------------------------------------------------------------------------------- the action */

export interface ActionDef extends GearDef {
  element?: Attribute | null;
  type?: Type1 | null;
  type2?: Type2 | null;
  cast?: Cast | null;
  cast2?: Cast | null;
  /** This cast is the resonator leaving the field — an Outro, the swap markers below, an echo's
   *  `swap()` form. What `lostOnSwap()` fires on, and never an on-field row for `isActive()`. */
  swapOut?: boolean;
  node?: Node | null;
  scaling?: Scaling | null;
  mv?: number;
  /** How much Resonance Energy/Concerto/Off-tune this resonator's own cast generates — the
   *  baseline every action carries regardless of any buff, same declared-once shape as `mv`.
   *  evaluate() banks this into the running total automatically (TeamMember.energy/concerto,
   *  State.offtune) right alongside whatever AddEnergy/AddConcerto/AddOfftune a held buff
   *  contributed — a kit never touches these fields itself, only declares them per action. */
  energy?: number;
  concerto?: number;
  offtune?: number;
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
  /** Report this cast as a triggered row even though it came straight off a rotation list — for
   *  engine bookkeeping a resonator didn't press a button for (the swap markers below).
   *  Everything else `run()` derives on its own; see its `triggered` local. */
  triggered?: boolean;
  /** A press whose whole animation freezes the world — a Liberation cinematic, the Tune Break,
   *  Jinhsi's Illuminous Epiphany — so the engine's second (helpers.ts's `oneSecondPassed()`)
   *  does not count it. */
  cutscene?: boolean;
  /** The field this hit belongs to — a summon firing on its own beside the fight (a coordinated
   *  attack, Denia's Erosion Field, Jué's follow-up, Xiangli Yao's outro laser, Rebecca's turret).
   *  The same `ActionField` the Buff that opens the field names, which is what pairs a run of hits
   *  with the cast that created them (see `ActionField` below). A one-off reuse of a field's own
   *  hit outside it (Mortefi's S5 burst, Verina's S6 proc) leaves it off, or clears it with `null`
   *  on a variant of a hit that has one. */
  field?: ActionField | null;
}

/** A cast. Mostly data — element/type/cast tags, its motion value, and the energy/concerto/
 *  off-tune/forte it banks — but a Gear like any other, so anything an action *does* can live
 *  directly on it: `evaluate()` runs the acting action's own hooks first in every phase, with the
 *  "current" pointers aimed at it, so what it grants is attributed to it and every stat it
 *  contributes is sourced to its own name. Prefer that to a held Gear branching on
 *  `runningAction(X)`; a `casting(Y)`/`isType(Y)` check that spans a whole *category* of
 *  actions still belongs on the Gear.
 *
 *  Lives here rather than in gear.ts so its rotation-flavoured forms — `dodgeCancel()` queuing DODGE,
 *  `jumpCancel()` queuing JUMP, `swap()` — sit beside the markers they belong with. gear.ts refers to it strictly through
 *  `import type`, which is what keeps the two modules from being a load-order cycle. */
export class Action extends Gear {
  element: Attribute | null;
  type1: Type1 | null;
  type2: Type2 | null;
  cast: Cast | null;
  cast2: Cast | null;
  swapOut: boolean;
  node: Node | null;
  scaling: Scaling | null;
  mv: number;
  energy: number;
  concerto: number;
  offtune: number;
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
  triggered: boolean;
  cutscene: boolean;
  /** What this was built from, kept so `variant()` can rebuild it with a change or two. */
  readonly def: ActionDef;
  /** The cast this is the dash- or jump-cancelled form of; null on every ordinary one. A cancel is
   *  a fresh Action carrying the original's hooks and cast tags, so a bare `===` against the cast a
   *  kit named would miss it — context.ts's own `runningAction()` is what reads this. Engine-owned:
   *  set by `cancelled()` below, never by a kit. */
  cancelOf: Action | null = null;
  /** Lazily-filled cache for runtime.ts's `tagWordOf()` — this action's own element/type/type2, as the
   *  one word every scoped stat contribution tests against. Engine-owned; never set by a kit. */
  _tagWord?: number;

  constructor(name: string, def: ActionDef = {}) {
    super({ ...def, name });
    this.element = def.element ?? null;
    this.type1 = def.type ?? null;
    this.type2 = def.type2 ?? null;
    this.cast = def.cast ?? null;
    this.cast2 = def.cast2 ?? null;
    this.swapOut = def.swapOut ?? false;
    this.node = def.node ?? null;
    this.scaling = def.scaling ?? null;
    this.mv = def.mv ?? 0;
    // No default: an action that deals damage says what it multiplies, so a kit that forgets
    // fails here rather than silently scaling off ATK. Only a rotation marker (SWAP and
    // friends below), which carries no motion value, is allowed to leave it null.
    if (this.mv !== 0 && this.scaling === null) throw new Error(`${name}: an action with a motion value must declare its scaling`);
    this.energy = def.energy ?? 0;
    this.concerto = def.concerto ?? 0;
    this.offtune = def.offtune ?? 0;
    this.slot = def.slot ?? null;
    this.resetEnergy = def.resetEnergy ?? false;
    this.forte1 = def.forte1 ?? 0;
    this.forte2 = def.forte2 ?? 0;
    this.forte3 = def.forte3 ?? 0;
    this.forte4 = def.forte4 ?? 0;
    this.forte5 = def.forte5 ?? 0;
    this.forteDeltas = [this.forte1, this.forte2, this.forte3, this.forte4, this.forte5];
    this.resetForte = [!!def.resetForte1, !!def.resetForte2, !!def.resetForte3, !!def.resetForte4, !!def.resetForte5];
    this.resolveFn = def.resolve;
    this.triggered = def.triggered ?? false;
    this.cutscene = def.cutscene ?? false;
    this.def = def;
  }

  /** The same cast again under `overrides` — every hook and number shared, but a new Action, so
   *  the two are told apart by identity wherever it matters (a Mainslot's off-field copy of its
   *  own hit, say). */
  variant(name: string, overrides: ActionDef): Action {
    return new Action(name, { ...this.def, ...overrides });
  }

  /** This cast dash-cancelled the moment it is pressed, named "… (Cancel)" — its own effects (the
   *  hooks, the cast tags) with none of its hit: no motion value, element, types, scaling, or
   *  energy/concerto/off-tune/forte. Queues the DODGE that cancels it behind itself, so a
   *  rotation writes only the cancel. */
  dodgeCancel(): Action { return this.cancelled(DODGE); }

  /** The same, cancelled by a jump rather than a dash — the JUMP marker in the DODGE's place. */
  jumpCancel(): Action { return this.cancelled(JUMP); }

  /** Both of the above: the cast's own effects with none of its hit, pointed back at the cast it
   *  cancels so `runningAction()` still reads the two as one. */
  private cancelled(marker: Action): Action {
    const d = this.def;
    const out = new Action(`${this.name} (Cancelled)`, {
      cast: d.cast, swapOut: d.swapOut,
      combatStart: d.combatStart, updateDebuffs: d.updateDebuffs, updateGlobal: d.updateGlobal,
      // the marker is queued ahead of the hook, so it resolves before anything the cancelled
      // press itself queues — the dash is what interrupts the cast, not something trailing it
      updateBuffs: () => { queue(marker); d.updateBuffs?.(); },
      applyStats: d.applyStats, convertStats: d.convertStats, afterAction: d.afterAction, lateConvertStats: d.lateConvertStats,
      display: d.display,
    });
    out.cancelOf = this;
    return out;
  }

  /** The follow-up hit of a multi-hit coordinated attack — the same hit under the same name,
   *  but inside the lead's ICD, so it carries none of the lead's grants (no `updateBuffs`). */
  paired(): Action {
    return this.variant(this.name, { updateBuffs: undefined });
  }

  /** The same cast made on the way out, named "… (Swap)" — identical in every field, but
   *  a swap-out (its owner is leaving the field as it lands) and reported as triggered. */
  swap(): Action {
    return this.variant(`${this.name} (Swap)`, { triggered: true, swapOut: true });
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
  constructor(name: string, actions: Action[]) {
    super(name);
    this.actions = actions;
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
 *  than closing it, so markers written back to back share one body — `START_2, START_3, Skill,
 *  SWAP` is one section that reads the same from either position — and one written part-way
 *  through takes only the casts after it.
 *
 *  A section closes on a SWAP, or on its own chain's outro if it runs that far. It can sit on its
 *  own ahead of NOINTRO/INTRO, or *inside* the rotation body, which is usually the shorter way to
 *  write it: a cast that opens the fight is nearly always one the resonator repeats every loop
 *  anyway, and inline it gets written once. Placed there, it is skipped on that member's first
 *  visit — they already spent it in the scramble, and it is on cooldown — and plays as an ordinary
 *  part of the rotation every visit after. */
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

/** Chain entry: arrive on an Outro and cast whichever Intro this resonator's own kit calls for —
 *  resolved against the acting slot's own `Resonator.introFn()` every time it's reached, so a kit
 *  with more than one (Phrolova's EIntro, Shorekeeper's Discernment) picks there rather than the
 *  rotation author having to know which visit needs which. */
export const INTRO = new Action("Intro Placeholder", {
  resolve: () => {
    const resonator = currentMember().resonator;
    if (!resonator) throw new Error(`${currentMember().name} casts INTRO but has no Resonator equipped`);
    return resonator.introFn();
  },
});

/** Chain entries by team position: the Intro chain this resonator plays instead of the INTRO
 *  chain while they stand first, second or third (the positions START_1/2/3 name) — a kit whose
 *  visit reads differently by where it falls in the trip round the team. Each is written as its
 *  own chain, closed by an OUTRO of its own, and cast exactly like an INTRO chain; from any other
 *  position it is simply never played, and a position with none plays the INTRO chain. A
 *  FIRST_INTRO chain still takes the first arrival. */
const introAt = (n: number): Action => new Action(`Intro Placeholder (${["1st", "2nd", "3rd"][n]})`, {
  resolve: () => {
    const resonator = currentMember().resonator;
    if (!resonator) throw new Error(`${currentMember().name} casts an Intro but has no Resonator equipped`);
    return resonator.introFn();
  },
});
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

/** The "cast the equipped mainslot echo here" markers — every build equips exactly one, so a
 *  rotation names the slot rather than the echo, and says *how* it is pressed. What lands is the
 *  echo's own business (gear.ts's `Mainslot`, by its `EchoType`): a SUMMON is the same follow-up hit
 *  under all three, reported as triggered; a TRANSFORM is a press of the resonator's own and the
 *  three differ — ECHO_ONFIELD is the full cast, ECHO_CANCEL the cast dash-cancelled before it lands
 *  (its effects, none of its hit), and ECHO_SWAP the cast made on the way out: `Action.swap()`'s
 *  swap-out triggered form, resolved right where it stands rather than deferred anywhere. The
 *  plain "cast it in the middle of the rotation" case. */
export const ECHO_ONFIELD = new Action("Echo Placeholder (on field)", {
  resolve: () => {
    const mainslot = currentMember().mainslot;
    if (!mainslot) throw new Error(`${currentMember().name} casts ECHO_ONFIELD but has no Mainslot equipped`);
    return mainslot.onfield;
  },
});

/** Written right before the outro — see ECHO_ONFIELD above. */
export const ECHO_SWAP = new Action("Echo Placeholder (swap)", {
  resolve: () => {
    const mainslot = currentMember().mainslot;
    if (!mainslot) throw new Error(`${currentMember().name} casts ECHO_SWAP but has no Mainslot equipped`);
    return mainslot.outro;
  },
});

/** The press dash-cancelled — see ECHO_ONFIELD above. */
export const ECHO_CANCEL = new Action("Echo Placeholder (cancel)", {
  resolve: () => {
    const mainslot = currentMember().mainslot;
    if (!mainslot) throw new Error(`${currentMember().name} casts ECHO_CANCEL but has no Mainslot equipped`);
    return mainslot.cancel;
  },
});

/** Chain entry: a second Intro this resonator needs *before* their real one — usually a main DPS
 *  banking Intro effects twice. It takes the outro that would have opened the previous
 *  resonator's visit: the owner's Intro is cast, the section's casts play, and it leaves on a
 *  plain SWAP back — the previous resonator's visit is then their NOINTRO chain, whose outro
 *  hands forward for the main INTRO chain. Closed by an OUTRO of its own instead, the handback
 *  is that real outro, the previous resonator plays their whole normal visit in between, and no
 *  NOINTRO chain is needed. */
export const DOUBLE_INTRO = new Action("Double Intro");

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
 *  hasn't (Hiyuki's fourth Iai, bought by being out of combat) writes it once here. */
export const NOINTRO_FIRST = new Action("First No Intro");

/** Chain exit: leave by Outro, handing the field (and whatever `queueOutro()` published) to the
 *  next resonator in team order — except closing a DOUBLE_INTRO section, where it hands to the
 *  *previous* one (see the marker above). Resolved against the acting slot's own
 *  `Resonator.outroFn()`, same as INTRO above. Every chain ends on it, and a start-of-combat
 *  section that runs to the end of one is closed by it too. */
export const OUTRO = new Action("Outro Placeholder", {
  // resolved when the row is reached, not when the visit opens: a kit whose outro has a Unison
  // form (shared/unison.ts's `unisonOutro`) only holds Unison once the visit's own Liberation has
  // granted it, so the pick has to wait for the swap itself
  resolve: () => {
    const resonator = currentMember().resonator;
    if (!resonator) throw new Error(`${currentMember().name} outros but has no Resonator equipped`);
    return resonator.outroFn();
  },
});

/** The row a plain swap reports as: between the opening scramble's sections and out of a swap-form
 *  DOUBLE_INTRO section the scheduler emits it itself; a kit writes it to close a start-of-combat
 *  section, where the normal loop drops it entirely — the swap is the scramble's, not the
 *  rotation's — or in an outro's place at the end of any chain, leaving without an Outro: the next
 *  slot then plays their NOINTRO chain, which they must declare. Zero damage, and a swap-out, so
 *  every "lost on swap" buff the outgoing resonator holds drops exactly as it would on an Outro
 *  (context.ts's own `lostOnSwap()`). */
export const SWAP = new Action("Swap", { swapOut: true, triggered: true });

/** Filler a kit writes into a chain body where the player dodges or jumps mid-rotation: no
 *  damage, no gauges, an ordinary on-field row, reported as triggered. DODGE is also what every
 *  `Action.dodgeCancel()` form queues behind itself — the dash that cancels the cast. */
export const DODGE = new Action("Dodge", { triggered: true });
export const JUMP = new Action("Jump", { triggered: true });

/* ------------------------------------------------------------------------------ the rotation */

/** One visit to the field: what this resonator does, and how they leave. The entry marker is not
 *  in `body` — an Intro is prepended by the scheduler, and neither of the other two is a cast. An
 *  inline start-of-combat section still is, brackets and all: the scheduler strips the markers and,
 *  on a first visit, everything between them (see `runRotations()`). */
export interface Chain {
  entry: Action;
  body: Action[];
  /** OUTRO, or SWAP for a chain that leaves the field without an Outro. */
  exit: Action;
}

/** A resonator's rotation, compiled into the ways they can arrive. Only `intro` is required: a
 *  resonator with no start-of-combat section for the position they stand in sits out the fight's
 *  opening scramble, one with no
 *  NOINTRO chain simply can't lead a team, and `doubleIntro` marks the pre-Intro visit a
 *  DOUBLE_INTRO section declares (see `runRotations()`). */
export class Rotation {
  /** What each start-of-combat section holds, by the team position it is for (START_1/2/3) —
   *  body only, without the SWAP that closes it: the scheduler emits the scramble's own swaps
   *  itself. `null` at a position this rotation declares no section for, which is most of them. */
  startCombat: (Action[] | null)[] = [null, null, null];
  opener: Chain | null = null;
  intro: Chain;
  /** The DOUBLE_INTRO section: `exit` is SWAP for the swap-back form (it ran into the INTRO
   *  marker) or OUTRO for the outro-back form. */
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
    // whichever body an inline section's casts belong to as well as to `start` — null while the
    // section stands on its own, ahead of the chains
    // which positions' start-of-combat sections are open — more than one where the markers were
    // written back to back, which is how a section that reads the same from two positions is
    // spelled (`START_2, START_3, Skill, SWAP`) — and what each has collected
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
    let openerExit: Action | null = null, introExit: Action | null = null, doubleExit: Action | null = null;
    let firstExit: Action | null = null, firstOpenerExit: Action | null = null;
    const introExits: (Action | null)[] = [null, null, null], openerExits: (Action | null)[] = [null, null, null];
    // what each NOINTRO_n chain ran into rather than closing on an outro: the INTRO chain
    // ("main") or its own position's INTRO_n chain (n)
    const sharedInto: ("main" | number | null)[] = [null, null, null];

    // OUTRO or SWAP ending whichever chain is open
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

    for (const action of actions) {
      if (startPosition(action) >= 0) {
        const at = startPosition(action);
        if (starts[at]) throw new Error(`rotation: only one ${action.name} section`);
        // opens alongside whatever is already open rather than closing it: every position whose
        // marker is still open collects what follows, so back-to-back markers share one body and
        // a marker written part-way through takes only the tail after it
        starts[at] = [];
        inStart.push(at);
        // an inline section stays in its chain's own body, markers included, so the scheduler can
        // tell where it begins and ends when it comes to skip it
        body()?.push(action);
      } else if (action === SWAP) {
        // closing a start-of-combat section, or any chain in an outro's place: the resonator
        // leaves without an Outro and the next slot plays their NOINTRO chain (the scheduler)
        if (inStart.length) { inStart = []; body()?.push(action); }
        else close(action);
      } else if (inStart.length) {
        for (const at of inStart) starts[at]!.push(action);
        body()?.push(action);
      } else if (action === NOINTRO) {
        if (openerExit || prefix.length || shared || sharedDouble) throw new Error("rotation: only one NOINTRO chain");
        if (phase !== "none") throw new Error("rotation: NOINTRO opens a chain while one is still open");
        phase = "opener";
      } else if (action === DOUBLE_INTRO) {
        if (doubleExit || dbl.length) throw new Error("rotation: only one DOUBLE_INTRO section");
        // a NOINTRO chain running into DOUBLE_INTRO shares the section: leading, the opener is the
        // prefix and then the pre-visit's own casts, leaving on the pre-visit's outro
        if (phase === "opener") sharedDouble = true;
        else if (phase !== "none") throw new Error("rotation: DOUBLE_INTRO opens a chain while one is still open");
        phase = "double";
      } else if (action === FIRST_INTRO) {
        if (firstExit || first.length) throw new Error("rotation: only one FIRST_INTRO chain");
        if (phase !== "none") throw new Error("rotation: FIRST_INTRO opens a chain while one is still open");
        phase = "first";
      } else if (action === NOINTRO_FIRST) {
        if (firstOpenerExit || firstPre.length) throw new Error("rotation: only one NOINTRO_FIRST chain");
        if (phase !== "none") throw new Error("rotation: NOINTRO_FIRST opens a chain while one is still open");
        phase = "firstOpener";
      } else if (nointroPosition(action) >= 0) {
        const n = nointroPosition(action);
        if (openerExits[n] || prefixes[n]!.length || sharedInto[n] !== null) throw new Error(`rotation: only one ${action.name} chain`);
        if (phase !== "none") throw new Error(`rotation: ${action.name} opens a chain while one is still open`);
        phase = `opener@${n}`;
      } else if (introPosition(action) >= 0) {
        const n = introPosition(action);
        // inside its own open chain it is a cast, the way a second INTRO is (Camellya)
        if (phase === `intro@${n}`) { loops[n]!.push(action); continue; }
        if (introExits[n] || loops[n]!.length) throw new Error(`rotation: only one ${action.name} chain`);
        // a NOINTRO_n chain running into its own position's INTRO_n shares the tail from there
        if (phase === `opener@${n}`) sharedInto[n] = n;
        else if (phase !== "none") throw new Error(`rotation: ${action.name} opens a chain while one is still open`);
        phase = `intro@${n}`;
      } else if (action === INTRO) {
        // INTRO is the one marker that also stands for a real cast, so a second one inside the
        // already-open Intro chain is a cast, not a chain boundary — Camellya's double Intro
        if (phase === "intro") { loop.push(action); continue; }
        if (phase.startsWith("intro@")) { loops[Number(phase.slice(6))]!.push(action); continue; }
        if (introExit) throw new Error("rotation: only one INTRO chain");
        // the walk-through: an INTRO reached inside an open NOINTRO chain isn't cast, it just marks
        // where the tail the two share begins — a NOINTRO_n chain shares the same way
        if (phase === "opener") shared = true;
        if (phase.startsWith("opener@")) sharedInto[Number(phase.slice(7))] = "main";
        // a DOUBLE_INTRO section running into the INTRO marker is the swap-back form
        if (phase === "double") doubleExit = SWAP;
        phase = "intro";
      } else if (action === OUTRO) {
        // a section left open runs to the end of its chain, and that chain's own outro closes it —
        // the outro is the chain's either way, never a cast the scramble replays
        inStart = [];
        close(action);
      } else {
        const into = body();
        if (!into) throw new Error(`rotation: ${action.name} sits outside any action chain`);
        into.push(action);
      }
    }

    if (inStart.length) throw new Error(`rotation: the ${inStart.map((at) => STARTS[at]!.name).join(" / ")} section is never closed by a SWAP`);
    if (phase !== "none") throw new Error("rotation: a chain is left open with no outro to close it");
    // a rotation written only for named positions (INTRO_2/INTRO_3, a fixed-slot sub-DPS) has no
    // main chain of its own: the first position written stands in wherever no chain is named
    const stand = introExits.findIndex(Boolean);
    if (!introExit && stand < 0) throw new Error("rotation: every rotation needs an INTRO chain closed by an outro");
    if (!introExit) { introExit = introExits[stand]!; loop.push(...loops[stand]!); }
    this.startCombat = starts.map((cast) => (cast && cast.length ? cast : null));
    if (sharedDouble) {
      // the swap-back form hands to the previous slot's NOINTRO chain, and a leader has none to hand to
      if (doubleExit !== OUTRO) throw new Error("rotation: a NOINTRO chain shared with a DOUBLE_INTRO section needs that section closed by an OUTRO, not run into INTRO");
      this.opener = { entry: NOINTRO, body: [...prefix, ...dbl], exit: doubleExit };
    } else if (openerExit || shared) {
      // the shared form runs the prefix and then everything the Intro chain does, minus the Intro
      this.opener = { entry: NOINTRO, body: shared ? [...prefix, ...loop] : prefix, exit: openerExit ?? introExit };
    } else if (prefix.length) {
      throw new Error("rotation: the NOINTRO chain is closed by neither an outro nor an INTRO");
    }
    if (doubleExit) this.doubleIntro = { entry: DOUBLE_INTRO, body: dbl, exit: doubleExit };
    // entry INTRO, not FIRST_INTRO: it is an Intro chain in every way the scheduler cares about,
    // and only which visit plays it differs
    if (firstExit) this.firstIntro = { entry: INTRO, body: first, exit: firstExit };
    // entry NOINTRO for the same reason the one above is INTRO: it arrives the way an opener does,
    // and only which visit plays it differs
    if (firstOpenerExit) this.firstOpener = { entry: NOINTRO, body: firstPre, exit: firstOpenerExit };
    this.intro = { entry: INTRO, body: loop, exit: introExit };
    for (const n of [0, 1, 2]) {
      const exit = introExits[n];
      if (exit) this.intros[n] = { entry: INTRO, body: loops[n]!, exit };
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
 * opens the next one. `sections` is how many to fill: the report's Opener and Loop 1-3.
 */
/** Why a team can't be scheduled at all, or `null` if it can — the checks the scheduler makes
 *  up front, per team, so a failure names the composition rather than surfacing mid-fight. Also
 *  what teams.ts asks before listing a team: one that can't play is left out of the roster.
 *
 *  - the leader needs a no-Intro chain to open on;
 *  - a chain closed by SWAP rather than an outro hands to the next slot's no-Intro chain;
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
    if ([r.intros[i] ?? r.intro, r.firstIntro, r.firstOpener, openerChain(i)].some((c) => c?.exit === SWAP) && !openerChain(nxt)) {
      return `${names[nxt]} follows ${names[i]}'s swap-out but declares no NOINTRO chain`;
    }
    const d = r.doubleIntro;
    if (!d) continue;
    const prev = (i + rotations.length - 1) % rotations.length;
    if (d.exit === SWAP && !openerChain(prev)) return `${names[prev]} plays during ${names[i]}'s double Intro but declares no NOINTRO chain`;
    if (d.exit === SWAP && rotations[0]!.doubleIntro) return `${names[i]}: a swap-form double Intro can't play in a team whose leader has a double Intro`;
    if (d.exit === OUTRO && i === 1 && !rotations[0]!.doubleIntro && rotations[2]?.doubleIntro?.exit !== OUTRO) {
      return `${names[i]}'s double Intro has nobody to hand back to: ${names[0]} has already played, and ${names[2]} declares no double Intro to pair with`;
    }
  }
  return null;
}

export function runRotations(state: State, rotations: Rotation[], sections: number): Result[][] {
  const why = teamPlayable(rotations, state.slots.map((s) => s.name));
  if (why) throw new Error(why);
  // Whoever has already played, and so which of the two forms of a chain an arrival takes: the
  // first-arrival ones are the chain a resonator plays the one time they turn up having never
  // acted, whichever entry that arrival uses.
  const visited = new Set<number>(), scrambled = new Set<number>();
  // a slot's own no-Intro chain: its first-arrival form, else the one written for the position it
  // stands in, else the plain one
  const openerChain = (i: number): Chain | null => {
    const r = rotations[i]!;
    const main = r.openers[i] ?? r.opener;
    return !visited.has(i) && r.firstOpener ? r.firstOpener : main ?? r.firstOpener;
  };
  const last = state.slots.length - 1;
  const out: Result[][] = Array.from({ length: sections }, (): Result[] => []);
  let section = 0;

  // The section the last slot has just outro'd out of stays open for the Intro that outro
  // triggers: `closing` says the next rows to land are that Intro's, and `place()` cuts there —
  // after the Intro row and every follow-up it queued (evaluate.ts's own `queued`), so the next
  // section opens on the visit's first rotation cast. A visit that opens on something other than
  // an Intro (never, in practice) closes the section on the cut it used to: nothing carried over.
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
    if (section >= sections) return;
    if (!closing) { out[section]!.push(...snaps); return; }
    let cut = 0;
    if (snaps.length && isCast(snaps[0]!.action, Cast.Intro)) {
      cut = 1;
      while (cut < snaps.length && snaps[cut]!.queued) cut++;
    }
    out[section]!.push(...snaps.slice(0, cut));
    section++;
    closing = false;
    if (section < sections) out[section]!.push(...snaps.slice(cut));
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
    state.outroDir = chain.entry === DOUBLE_INTRO ? -1 : 1;
    const skipStart = !visited.has(i) && scrambled.has(i);
    visited.add(i);
    const casts: Action[] = [];
    // which positions' start-of-combat sections the walk is inside — more than one where their
    // markers were written back to back (see the Rotation constructor)
    let inStart: number[] = [];
    for (const a of chain.body) {
      const at = startPosition(a);
      if (at >= 0) { inStart.push(at); continue; }
      // the SWAP closing the section is the scramble's own row, never the loop's
      if (a === SWAP && inStart.length) { inStart = []; continue; }
      // an inline section's casts are the loop's own for everyone — its markers only name whose
      // opening scramble already spent them, and that member alone skips them, on the one visit
      // right after the scramble did
      if (inStart.length && inStart.includes(i) && skipStart) continue;
      casts.push(a);
    }
    // a trip round the team is its members' own visits; a pre-visit is an extra, not one of them
    if (chain.entry !== DOUBLE_INTRO) { if (!mained.size) cycleStart = i; mained.add(i); }
    // the outro is the OUTRO marker itself, resolved on its own row (see it): a kit's Unison form
    // depends on what the visit granted by then
    const exit = chain.exit === SWAP ? SWAP : OUTRO;
    const list = chain.entry === INTRO || chain.entry === DOUBLE_INTRO ? [INTRO, ...casts, exit] : [...casts, exit];
    const snaps = run(state, list);
    state.outroDir = 1;
    // an Outro row advances the field itself (evaluate.ts); a plain swap hands it forward here
    swapped = chain.exit === SWAP;
    if (swapped) state.active = (i + 1) % rotations.length;
    place(snaps);
    // one full trip round the team is done — the Intro this outro hands into closes the section
    // (see `place()`). A double-Intro visit never closes one: its owner's main outro does.
    if (i === last && chain.entry !== DOUBLE_INTRO) {
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
    // nobody to swap to: the resonator carries straight on into their own next chain, no swap row
    const opening = rotations[i]!.startCombat[i]!;
    const chain = next === i ? opening : [...opening, SWAP];
    out[section]!.push(...run(state, chain));
    state.active = next;
    scrambled.add(i);
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
      !mained.has(at) && !doubled.has(at) && rotations[at]!.doubleIntro?.exit === OUTRO;
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
      if (d.exit === OUTRO) {
        runChain(nxt, d); // its outro hands straight back here; fall through to the normal visit
        giver = nxt;
      } else {
        state.active = nxt;
        // the swap back is the scheduler's own row, same as the opening scramble's: a real Swap
        // row in the table, so whatever the section's last cast queued lands before it
        place(run(state, [INTRO, ...d.body, SWAP]));
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
    if (own && own.exit === OUTRO && !doubled.has(i)) {
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
      while (state.active !== i && !mained.has(i) && section < sections) visit(state.active);
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
   *  has run — the section closes on whoever intros next, as it would have anyway. */
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
    while (section < sections) {
      if (++trips > 100) throw new Error("rotation scheduler did not fill every section");
      // the opener already stood in for the leader's first pre-visit
      for (let i = first ? 1 : 0; i < rotations.length && section < sections; i++) {
        const d = rotations[i]!.doubleIntro;
        if (d) runChain(i, d);
      }
      first = false;
      for (let i = 0; i < rotations.length && section < sections; i++) runChain(i, arrival(i));
    }
    return out;
  }

  let guard = 0;
  while (section < sections) {
    if (++guard > 100) throw new Error("rotation scheduler did not fill every section");
    visit(state.active);
  }
  return out;
}
