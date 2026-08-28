/**
 * Rotations, and the scheduler that decides whose turn it is.
 *
 * A resonator's rotation is not a flat list of casts — it's up to three *action chains*, one per
 * way of arriving on field, and a kit writes all three as a single array that `Rotation`'s
 * constructor splits apart:
 *
 *   new Rotation([
 *     START_COMBAT, Skill,                                  // the fight's own first seconds
 *     OPENER, BA1, BA2, GeopotentialShift,                  // leading the team, with no Intro to cast
 *     INTRO, Liberation, WBA1, WBA2, ECHO_OUTRO, OUTRO_NEXT, // every visit after
 *   ])
 *
 * The OPENER chain runs *through* the INTRO marker without casting it and carries on into the same
 * tail, so the body a resonator repeats is written once — the opener is that body plus whatever
 * prefix it declares, minus the Intro nobody could have handed them at the start of a fight. Give
 * the opener its own OUTRO before the INTRO instead and the two stop sharing, for a kit whose
 * opener genuinely isn't its loop.
 *
 * Markers are `Action`s so a kit can keep writing one plain array, but none of them is a cast:
 * INTRO and the three ECHO_* markers stand for one and resolve through `Action.resolve` at run
 * time, and the rest are read by the compiler here and never reach `evaluate()`. `SWAP` is the exception — the
 * engine emits it itself, and a kit never writes it.
 */
import {
  Action, State, ResolvedSnapshot, EchoType, run, currentMember, queueOnIntro,
} from "./kit.js";

/* ------------------------------------------------------------------------------- the markers */

/** Delimits the fight's own first seconds — a *pair* of these brackets the section, opening and
 *  closing it. Every member who declares one gets a visit, in team order, each swapping straight
 *  out into the next: the opening scramble where a support fires their baseline skill purely to
 *  get their heals and buffs up, or somebody spends the bar they walked in holding, well before
 *  anyone has the concerto for an Intro.
 *
 *  The section can sit on its own ahead of OPENER/INTRO, or *inside* the rotation body, which is
 *  usually the shorter way to write it: a cast that opens the fight is nearly always one the
 *  resonator repeats every loop anyway, and inline it gets written once. Placed there, it is
 *  skipped on that member's first visit — they already spent it in the scramble, and it is on
 *  cooldown — and plays as an ordinary part of the rotation every visit after. */
export const START_COMBAT = new Action("Start of Combat");

/** Chain entry: on field with no Intro to cast, because nobody has outro'd yet — the visit that
 *  starts the rotation cycle. Only the team's own leader can ever use one (everyone else always
 *  arrives on somebody's Outro), so slot 1 must declare it and for slots 2 and 3 it is dead. */
export const OPENER = new Action("Opener");

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
 *  (its effects, none of its hit), and ECHO_OUTRO the cast made just before swapping out, which
 *  finishes on the next resonator's time: deferred to behind their Intro, inactive, still on its
 *  owner's own slot. The plain "cast it in the middle of the rotation" case. */
export const ECHO_ONFIELD = new Action("Echo Placeholder (on field)", {
  resolve: () => {
    const mainslot = currentMember().mainslot;
    if (!mainslot) throw new Error(`${currentMember().name} casts ECHO_ONFIELD but has no Mainslot equipped`);
    return mainslot.onfield;
  },
});

/** Written right before the outro — see ECHO_ONFIELD above. */
export const ECHO_OUTRO = new Action("Echo Placeholder (outro)", {
  resolve: () => {
    const mainslot = currentMember().mainslot;
    if (!mainslot) throw new Error(`${currentMember().name} casts ECHO_OUTRO but has no Mainslot equipped`);
    if (mainslot.echoType === EchoType.SUMMON) return mainslot.outro;
    queueOnIntro(mainslot.outro);
    return null;
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

/** Chain exit: leave by Outro, handing the field (and whatever `queueOutro()` published) to the
 *  next resonator in team order — or, for OUTRO_LAST, to the previous one. Resolved against the
 *  acting slot's own `Resonator.outroFn()`, same as INTRO above. Both the OPENER and the INTRO
 *  chain end on one of these; a START_COMBAT chain ends on neither. */
export const OUTRO_NEXT = new Action("Outro (next)");
export const OUTRO_LAST = new Action("Outro (previous)");

/** The row a plain swap reports as, emitted by the scheduler at the end of a START_COMBAT chain —
 *  never written by a kit. Zero damage, and inactive, so every "lost on swap" buff the outgoing
 *  resonator holds drops exactly as it would on an Outro (kit.ts's own `lostOnSwap()`). */
export const SWAP = new Action("Swap", { active: false, triggered: true });

const EXITS = new Set<Action>([OUTRO_NEXT, OUTRO_LAST]);

/* ------------------------------------------------------------------------------ the rotation */

/** One visit to the field: what this resonator does, and how they leave. The entry marker is not
 *  in `body` — an Intro is prepended by the scheduler, and neither of the other two is a cast. An
 *  inline START_COMBAT section still is, brackets and all: the scheduler strips the markers and,
 *  on a first visit, everything between them (see `runRotations()`). */
export interface Chain {
  entry: Action;
  body: Action[];
  exit: Action;
}

/** A resonator's rotation, compiled into the ways they can arrive. Only `intro` is required: a
 *  resonator with no START_COMBAT section sits out the fight's opening scramble, and one with no
 *  OPENER chain simply can't lead a team (see `runRotations()`). */
export class Rotation {
  /** What the START_COMBAT section holds, wherever it was written — body only, since the section
   *  has no exit marker of its own: leaving is the swap. */
  startCombat: Action[] | null = null;
  opener: Chain | null = null;
  intro: Chain;

  constructor(actions: Action[]) {
    let phase: "none" | "opener" | "intro" = "none";
    const start: Action[] = [], prefix: Action[] = [], loop: Action[] = [];
    // whichever body an inline section's casts belong to as well as to `start` — null while the
    // section stands on its own, ahead of both chains
    let inStart: Action | null = null, sections = 0;
    const body = (): Action[] | null => (phase === "opener" ? prefix : phase === "intro" ? loop : null);
    // set when the OPENER chain ran into the INTRO marker rather than an outro of its own, which
    // is what makes the two share everything from there down
    let shared = false;
    let openerExit: Action | null = null, introExit: Action | null = null;

    for (const action of actions) {
      if (action === START_COMBAT) {
        if (inStart) {
          inStart = null;
        } else {
          if (++sections > 1) throw new Error("rotation: only one START_COMBAT section");
          inStart = action;
        }
        // an inline section stays in its chain's own body, brackets included, so the scheduler can
        // tell where it begins and ends when it comes to skip it
        body()?.push(action);
      } else if (inStart) {
        start.push(action);
        body()?.push(action);
      } else if (action === OPENER) {
        if (openerExit || prefix.length || shared) throw new Error("rotation: only one OPENER chain");
        if (phase === "opener" || phase === "intro") throw new Error("rotation: OPENER opens a chain while one is still open");
        phase = "opener";
      } else if (action === INTRO) {
        // INTRO is the one marker that also stands for a real cast, so a second one inside the
        // already-open Intro chain is a cast, not a chain boundary — Camellya's double Intro
        if (phase === "intro") { loop.push(action); continue; }
        if (introExit) throw new Error("rotation: only one INTRO chain");
        // the walk-through: an INTRO reached inside an open OPENER chain isn't cast, it just marks
        // where the tail the two share begins
        if (phase === "opener") shared = true;
        phase = "intro";
      } else if (EXITS.has(action)) {
        if (phase === "opener") { openerExit = action; phase = "none"; }
        else if (phase === "intro") { introExit = action; phase = "none"; }
        else throw new Error(`rotation: ${action.name} closes a chain that was never opened`);
      } else {
        const into = body();
        if (!into) throw new Error(`rotation: ${action.name} sits outside any action chain`);
        into.push(action);
      }
    }

    if (inStart) throw new Error("rotation: the START_COMBAT section is never closed by a second one");
    if (phase !== "none") throw new Error("rotation: a chain is left open with no outro to close it");
    if (!introExit) throw new Error("rotation: every rotation needs an INTRO chain closed by an outro");
    if (start.length) this.startCombat = start;
    if (openerExit || shared) {
      // the shared form runs the prefix and then everything the Intro chain does, minus the Intro
      this.opener = { entry: OPENER, body: shared ? [...prefix, ...loop] : prefix, exit: openerExit ?? introExit };
    } else if (prefix.length) {
      throw new Error("rotation: the OPENER chain is closed by neither an outro nor an INTRO");
    }
    this.intro = { entry: INTRO, body: loop, exit: introExit };
  }
}

/* ----------------------------------------------------------------------------- the scheduler */

/**
 * Run every member's rotation across `state`, in the order the fight actually goes.
 *
 * The opening scramble first: every START_COMBAT section there is, in team order, each ending on a
 * plain swap into the next (and the last of them swapping to slot 1). A section written inline in
 * its own rotation is then skipped on that member's first visit — they just spent it — and plays
 * normally on every visit after. Then slot 1's own OPENER
 * chain, since nobody has outro'd yet and so nobody has an Intro to cast. From there it is Intro
 * chains all the way — an Outro hands the field on, whoever it lands on runs theirs — until every
 * section is filled.
 *
 * A section closes on the *last* slot's own Outro, which is one full trip round the team; anything
 * that resolves after that row (a follow-up the outro itself queued) opens the next section rather
 * than closing this one. `sections` is how many to fill: the report's Opener and Loop 1-3.
 */
export function runRotations(state: State, rotations: Rotation[], sections: number): ResolvedSnapshot[][] {
  const last = state.slots.length - 1;
  const out: ResolvedSnapshot[][] = Array.from({ length: sections }, (): ResolvedSnapshot[] => []);
  let section = 0;

  // whoever has already had a visit — an inline START_COMBAT section plays on every visit but
  // their first, where the scramble already spent it. `scrambled` is who the scramble actually
  // visited, filled in below.
  const visited = new Set<number>(), scrambled = new Set<number>();

  const runChain = (i: number, chain: Chain): void => {
    state.active = i;
    const resonator = state.slots[i]!.resonator;
    if (!resonator) throw new Error(`${state.slots[i]!.name} outros but has no Resonator equipped`);
    const outro = resonator.outroFn();
    state.outroDir = chain.exit === OUTRO_LAST ? -1 : 1;
    const skipStart = !visited.has(i) && scrambled.has(i);
    visited.add(i);
    const casts: Action[] = [];
    let inStart = false;
    for (const a of chain.body) {
      if (a === START_COMBAT) { inStart = !inStart; continue; }
      if (!(inStart && skipStart)) casts.push(a);
    }
    const list = chain.entry === INTRO ? [INTRO, ...casts, outro] : [...casts, outro];
    const snaps = run(state, list);
    state.outroDir = 1;
    if (i !== last) { out[section]!.push(...snaps); return; }
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
  rotations.forEach((r, i) => { if (r.startCombat) starters.push(i); });
  for (let k = 0; k < starters.length; k++) {
    const i = starters[k]!;
    const next = starters[k + 1] ?? 0;
    state.active = i;
    // nobody to swap to: the resonator carries straight on into their own next chain, no swap row
    const chain = next === i ? rotations[i]!.startCombat! : [...rotations[i]!.startCombat!, SWAP];
    out[section]!.push(...run(state, chain));
    state.active = next;
    scrambled.add(i);
  }

  const opener = rotations[0]!.opener;
  if (!opener) throw new Error(`${state.slots[0]!.name} leads the team but declares no OPENER chain`);
  runChain(0, opener);

  let guard = 0;
  while (section < sections) {
    if (++guard > 100) throw new Error("rotation scheduler did not fill every section");
    runChain(state.active, rotations[state.active]!.intro);
  }
  return out;
}
