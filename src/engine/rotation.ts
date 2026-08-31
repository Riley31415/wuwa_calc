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
 * opener genuinely isn't its loop.
 *
 * Markers are `Action`s so a kit can keep writing one plain array, but none of them is a cast:
 * INTRO and the three ECHO_* markers stand for one and resolve through `Action.resolve` at run
 * time, and the rest are read by the compiler here and never reach `evaluate()`. `SWAP` doubles as
 * both: a kit writes it only to close a start-of-combat section, and the engine emits the real swap
 * rows itself.
 */
import { Gear, run, currentMember, queue } from "./kit.js";
import type { GearDef, State, ResolvedSnapshot } from "./kit.js";
import type { Attribute, Type1, Type2, Cast, Node, Scaling } from "./stats.js";

/* ------------------------------------------------------------------------------- the action */

export interface ActionDef extends GearDef {
  element?: Attribute | null;
  type?: Type1 | null;
  type2?: Type2 | null;
  cast?: Cast | null;
  cast2?: Cast | null;
  active?: boolean;
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
}

/** A cast. Mostly data — element/type/cast tags, its motion value, and the energy/concerto/
 *  off-tune/forte it banks — but a Gear like any other, so anything an action *does* can live
 *  directly on it: `evaluate()` runs the acting action's own hooks first in every phase, with the
 *  "current" pointers aimed at it, so what it grants is attributed to it and every stat it
 *  contributes is sourced to its own name. Prefer that to a held Gear branching on
 *  `currentAction() === X`; a `casting(Y)`/`isType(Y)` check that spans a whole *category* of
 *  actions still belongs on the Gear.
 *
 *  Lives here rather than in kit.ts so its rotation-flavoured forms — `dodgeCancel()` queuing DODGE,
 *  `swap()` — sit beside the markers they belong with. kit.ts refers to it strictly through
 *  `import type`, which is what keeps the two modules from being a load-order cycle. */
export class Action extends Gear {
  element: Attribute | null;
  type: Type1 | null;
  type2: Type2 | null;
  cast: Cast | null;
  cast2: Cast | null;
  active: boolean;
  node: Node | null;
  scaling: Scaling | null;
  mv: number;
  energy: number;
  concerto: number;
  offtune: number;
  slot: string | null;
  resetEnergy: boolean;
  forte1: number;
  forte2: number;
  forte3: number;
  forte4: number;
  forte5: number;
  resolveFn?: () => Action | null;
  triggered: boolean;
  /** What this was built from, kept so `variant()` can rebuild it with a change or two. */
  readonly def: ActionDef;
  /** Lazily-filled cache for kit.ts's `tagWordOf()` — this action's own element/type/type2, as the
   *  one word every scoped stat contribution tests against. Engine-owned; never set by a kit. */
  _tagWord?: number;

  constructor(name: string, def: ActionDef = {}) {
    super({ ...def, name });
    this.element = def.element ?? null;
    this.type = def.type ?? null;
    this.type2 = def.type2 ?? null;
    this.cast = def.cast ?? null;
    this.cast2 = def.cast2 ?? null;
    this.active = def.active ?? true;
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
    this.resolveFn = def.resolve;
    this.triggered = def.triggered ?? false;
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
  dodgeCancel(): Action {
    const d = this.def;
    return new Action(`${this.name} (Cancel)`, {
      cast: d.cast, cast2: d.cast2, active: d.active,
      combatStart: d.combatStart, updateDebuffs: d.updateDebuffs, updateGlobal: d.updateGlobal,
      updateBuffs: () => { d.updateBuffs?.(); queue(DODGE); },
      applyStats: d.applyStats, convertStats: d.convertStats, afterAction: d.afterAction, lateConvertStats: d.lateConvertStats,
      display: d.display,
    });
  }

  /** The same cast made on the way out, named "… (Swap)" — identical in every field, but
   *  inactive (its owner is off field by the time it lands) and reported as triggered. */
  swap(): Action {
    return this.variant(`${this.name} (Swap)`, { triggered: true, active: false });
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
 *  Tune Break can only land on its last cast, never part-way through (see kit.ts's
 *  `midActionGroup()` and tunebreak.ts). The break itself is not part of the group — it is queued
 *  behind that last cast like any other follow-up. */
export class ActionGroup extends Action {
  actions: Action[];
  constructor(name: string, actions: Action[]) {
    super(name);
    this.actions = actions;
  }
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

/** The "cast the equipped mainslot echo here" markers — every build equips exactly one, so a
 *  rotation names the slot rather than the echo, and says *how* it is pressed. What lands is the
 *  echo's own business (kit.ts's `Mainslot`, by its `EchoType`): a SUMMON is the same follow-up hit
 *  under all three, reported as triggered; a TRANSFORM is a press of the resonator's own and the
 *  three differ — ECHO_ONFIELD is the full cast, ECHO_CANCEL the cast dash-cancelled before it lands
 *  (its effects, none of its hit), and ECHO_SWAP the cast made on the way out: `Action.swap()`'s
 *  inactive triggered form, resolved right where it stands rather than deferred anywhere. The
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

/** Chain exit: leave by Outro, handing the field (and whatever `queueOutro()` published) to the
 *  next resonator in team order — except closing a DOUBLE_INTRO section, where it hands to the
 *  *previous* one (see the marker above). Resolved against the acting slot's own
 *  `Resonator.outroFn()`, same as INTRO above. Every chain ends on it, and a start-of-combat
 *  section that runs to the end of one is closed by it too. */
export const OUTRO = new Action("Outro Placeholder");

/** The row a plain swap reports as: between the opening scramble's sections and out of a swap-form
 *  DOUBLE_INTRO section the scheduler emits it itself; a kit writes it only to close a
 *  start-of-combat section, where the normal loop drops it entirely — the swap is the scramble's,
 *  not the rotation's. Zero damage, and inactive, so every "lost on swap" buff the outgoing
 *  resonator holds drops exactly as it would on an Outro (kit.ts's own `lostOnSwap()`). */
export const SWAP = new Action("Swap", { active: false, triggered: true });

/** Filler a kit writes into a chain body where the player dodges or jumps mid-rotation: no
 *  damage, no gauges, still an active row, reported as triggered. DODGE is also what every
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

  constructor(actions: Action[]) {
    let phase: "none" | "opener" | "double" | "intro" = "none";
    const prefix: Action[] = [], loop: Action[] = [], dbl: Action[] = [];
    // whichever body an inline section's casts belong to as well as to `start` — null while the
    // section stands on its own, ahead of the chains
    // which positions' start-of-combat sections are open — more than one where the markers were
    // written back to back, which is how a section that reads the same from two positions is
    // spelled (`START_2, START_3, Skill, SWAP`) — and what each has collected
    let inStart: number[] = [];
    const starts: (Action[] | null)[] = [null, null, null];
    const body = (): Action[] | null =>
      (phase === "opener" ? prefix : phase === "intro" ? loop : phase === "double" ? dbl : null);
    // set when the NOINTRO chain ran into the INTRO marker rather than an outro of its own, which
    // is what makes the two share everything from there down
    let shared = false;
    let openerExit: Action | null = null, introExit: Action | null = null, doubleExit: Action | null = null;

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
        if (inStart.length) { inStart = []; body()?.push(action); }
        else if (phase === "double") { doubleExit = action; phase = "none"; }
        else throw new Error("rotation: SWAP only closes a start-of-combat or DOUBLE_INTRO section");
      } else if (inStart.length) {
        for (const at of inStart) starts[at]!.push(action);
        body()?.push(action);
      } else if (action === NOINTRO) {
        if (openerExit || prefix.length || shared) throw new Error("rotation: only one NOINTRO chain");
        if (phase !== "none") throw new Error("rotation: NOINTRO opens a chain while one is still open");
        phase = "opener";
      } else if (action === DOUBLE_INTRO) {
        if (doubleExit || dbl.length) throw new Error("rotation: only one DOUBLE_INTRO section");
        if (phase !== "none") throw new Error("rotation: DOUBLE_INTRO opens a chain while one is still open");
        phase = "double";
      } else if (action === INTRO) {
        // INTRO is the one marker that also stands for a real cast, so a second one inside the
        // already-open Intro chain is a cast, not a chain boundary — Camellya's double Intro
        if (phase === "intro") { loop.push(action); continue; }
        if (introExit) throw new Error("rotation: only one INTRO chain");
        // the walk-through: an INTRO reached inside an open NOINTRO chain isn't cast, it just marks
        // where the tail the two share begins
        if (phase === "opener") shared = true;
        // a DOUBLE_INTRO section running into the INTRO marker is the swap-back form
        if (phase === "double") doubleExit = SWAP;
        phase = "intro";
      } else if (action === OUTRO) {
        // a section left open runs to the end of its chain, and that chain's own outro closes it —
        // the outro is the chain's either way, never a cast the scramble replays
        inStart = [];
        if (phase === "opener") { openerExit = action; phase = "none"; }
        else if (phase === "intro") { introExit = action; phase = "none"; }
        else if (phase === "double") { doubleExit = action; phase = "none"; }
        else throw new Error(`rotation: ${action.name} closes a chain that was never opened`);
      } else {
        const into = body();
        if (!into) throw new Error(`rotation: ${action.name} sits outside any action chain`);
        into.push(action);
      }
    }

    if (inStart.length) throw new Error(`rotation: the ${inStart.map((at) => STARTS[at]!.name).join(" / ")} section is never closed by a SWAP`);
    if (phase !== "none") throw new Error("rotation: a chain is left open with no outro to close it");
    if (!introExit) throw new Error("rotation: every rotation needs an INTRO chain closed by an outro");
    this.startCombat = starts.map((cast) => (cast && cast.length ? cast : null));
    if (openerExit || shared) {
      // the shared form runs the prefix and then everything the Intro chain does, minus the Intro
      this.opener = { entry: NOINTRO, body: shared ? [...prefix, ...loop] : prefix, exit: openerExit ?? introExit };
    } else if (prefix.length) {
      throw new Error("rotation: the NOINTRO chain is closed by neither an outro nor an INTRO");
    }
    if (doubleExit) this.doubleIntro = { entry: DOUBLE_INTRO, body: dbl, exit: doubleExit };
    this.intro = { entry: INTRO, body: loop, exit: introExit };
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
 * A section closes on the *last* slot's own Outro, which is one full trip round the team; anything
 * that resolves after that row (a follow-up the outro itself queued) opens the next section rather
 * than closing this one. `sections` is how many to fill: the report's Opener and Loop 1-3.
 */
export function runRotations(state: State, rotations: Rotation[], sections: number): ResolvedSnapshot[][] {
  // a swap-form double Intro bounces to the previous slot's NOINTRO chain — checked up front, per
  // team, so the failure names the composition rather than surfacing mid-fight
  rotations.forEach((r, i) => {
    if (!r.doubleIntro || r.doubleIntro.exit !== SWAP) return;
    const prev = (i + rotations.length - 1) % rotations.length;
    if (!rotations[prev]!.opener) {
      throw new Error(`${state.slots[prev]!.name} plays during ${state.slots[i]!.name}'s double Intro but declares no NOINTRO chain`);
    }
  });
  const last = state.slots.length - 1;
  const out: ResolvedSnapshot[][] = Array.from({ length: sections }, (): ResolvedSnapshot[] => []);
  let section = 0;

  // whoever has already had a visit — an inline start-of-combat section plays on every visit but
  // their first, where the scramble already spent it. `scrambled` is who the scramble actually
  // visited, filled in below.
  const visited = new Set<number>(), scrambled = new Set<number>();

  const runChain = (i: number, chain: Chain): void => {
    state.active = i;
    const resonator = state.slots[i]!.resonator;
    if (!resonator) throw new Error(`${state.slots[i]!.name} outros but has no Resonator equipped`);
    const outro = resonator.outroFn();
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
      // a section none of whose positions this member is standing in never plays at all; their own
      // plays every visit but the first, where the scramble already spent it
      if (inStart.length && (!inStart.includes(i) || skipStart)) continue;
      casts.push(a);
    }
    const list = chain.entry === INTRO || chain.entry === DOUBLE_INTRO ? [INTRO, ...casts, outro] : [...casts, outro];
    const snaps = run(state, list);
    state.outroDir = 1;
    // a double-Intro visit never closes a trip round the team — its owner's main outro does
    if (i !== last || chain.entry === DOUBLE_INTRO) { out[section]!.push(...snaps); return; }
    // one full trip round the team is done: cut at the outro row itself, so whatever it queued
    // lands in the section it actually belongs to
    const cut = snaps.findIndex((s) => s.action === outro) + 1;
    out[section]!.push(...snaps.slice(0, cut));
    section++;
    if (section < sections) out[section]!.push(...snaps.slice(cut));
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

  const opener = rotations[0]!.opener;
  if (!opener) throw new Error(`${state.slots[0]!.name} leads the team but declares no NOINTRO chain`);
  runChain(0, opener);

  // Whose double-Intro pre-visit has already run this cycle — set when it plays, cleared by the
  // owner's own main-Intro visit, so the next cycle round runs it again.
  const doubled = new Set<number>();
  const visit = (i: number): void => {
    // A double-Intro pre-visit fires on the arrival *before* its owner: the outro that landed
    // here was really theirs. Swap form: their Intro and section casts, a plain swap back, and
    // this slot's NOINTRO chain fills the field until its own outro hands forward for the main
    // Intro. Outro form: their section leaves on a real outro back here, and this slot plays its
    // whole normal visit in between instead.
    const nxt = (i + 1) % rotations.length;
    const d = rotations[nxt]!.doubleIntro;
    if (d && !doubled.has(nxt)) {
      doubled.add(nxt);
      if (d.exit === OUTRO) {
        runChain(nxt, d); // its outro hands straight back here; fall through to the normal visit
      } else {
        state.active = nxt;
        // no swap row of the scheduler's own: the section's last cast — a `.swap()` form — is the
        // leaving row itself
        out[section]!.push(...run(state, [INTRO, ...d.body]));
        state.active = i;
        runChain(i, rotations[i]!.opener!); // the NOINTRO fill; its outro hands forward
        return;
      }
    }
    doubled.delete(i);
    runChain(i, rotations[i]!.intro);
  };

  let guard = 0;
  while (section < sections) {
    if (++guard > 100) throw new Error("rotation scheduler did not fill every section");
    visit(state.active);
  }
  return out;
}
