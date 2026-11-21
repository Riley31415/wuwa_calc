/**
 * Shorekeeper's rotation bench: one candidate visit played straight through the engine (`runRotations` on a
 * fresh State, untraced), in a duo with Lily standing in for the rest of the team (her First Bloom, 19s,
 * her Outro), and read back as the search needs it — where its last press starts, where its Outro goes out,
 * whether that Outro had its Concerto, what Concerto the string banks and the forte it leaves.
 *
 * A candidate is a list of `Step`s: a press of `PRESSES` and the cut it takes. The workers are handed the
 * same list as indices (`toWire`), the one place a press travels as a number.
 */
import { Action, ActionGroup, Rotation, SWAPIN, JUMP, runRotations, waitFor } from "../engine/rotation.js";
import type { Result, ResolvedSnapshot } from "../engine/evaluate.js";
import { landedBullets } from "../page/display.js";
import { Cast, setDelays } from "../engine/stats.js";
import { State } from "../engine/state.js";
import { withTeam, equip, equipEnemy, casting, currentMember, currentCast, setTracing } from "../engine/context.js";
import { Buff } from "../engine/gear.js";
import { TUNE_BREAK_ENEMY } from "../shared/tunebreak.js";
import { member, comboOf } from "../solve/solver.js";
import type { Pick } from "../solve/solver.js";
import { FALLACY } from "../echoes/jinzhou.js";
import { FORMRENDER } from "../echoes/mengzhou.js";
import { SPACETREK_EXPLORER } from "../echoes/lahairoi.js";
import { SHOREKEEPER, SHOREKEEPER_PRESSES as SK } from "../resonators/spectro/shorekeeper.js";
import { LILY, LILY_PRESSES } from "../resonators/spectro/lily.js";

// the engine's unmet-condition warnings: the bench reads the bars itself, so they are only noise here
console.warn = (): void => {};

// a test's own delays, in frames, off the environment; the engine's defaults otherwise
const env = (k: string): number | undefined => (process.env[k] === undefined ? undefined : Number(process.env[k]));
setDelays({ cancel: env("CANCEL"), insta: env("INSTA"), mash: env("MASH"), hold: env("HOLD") });

/** How a press is cut into what follows it. `CancelOrNone` is a cancel where the engine takes it, and
 *  played out where it refuses one (into the Skill or the Liberation). */
export const enum Cut { None, Cancel, CancelOrNone, Insta, Dodge, Jump, Hold, Swap, InstaJump, PlainJump }
const CUT: Record<Cut, (a: Action) => Action> = {
  [Cut.None]: (a) => a,
  [Cut.Cancel]: (a) => a.cancel(),
  [Cut.CancelOrNone]: (a) => a.cancel(),
  [Cut.Insta]: (a) => a.instaCancel(),
  [Cut.Dodge]: (a) => a.dodgeCancel(),
  [Cut.Jump]: (a) => a.jumpCancel(),
  [Cut.Hold]: (a) => a.holdCancel(),
  [Cut.Swap]: (a) => a.instaSwap(),
  [Cut.InstaJump]: (a) => a.instaJump(),
  // played out, the jump a press of its own after it (`write()` adds it)
  [Cut.PlainJump]: (a) => a,
};

/** A press the search writes: Shorekeeper's own, the echoes then the Liberation (`echoesFirst`), her Intro
 *  (both, cut alike), the echoes as the swap, the Outro, or the probe. */
export interface Press { action: Action; echoesFirst?: true; intro?: true; echoSwap?: true; probe?: true }
export type Step = readonly [Press, Cut];

// read on the probe's cast: the Concerto and forte the string has banked, every hit still to come landed first
let probed = NaN, probedForte = NaN;
const PROBE_ACTION = new Action("Probe - Concerto", { animFrames: 1, castPriority: 100, updateBuffs: () => {
  probed = currentMember().concerto / 100;
  probedForte = currentMember().forte[0]!;
} });
const LANDING = waitFor(60, "hits to land");

export const P = {
  BA1: { action: SK.BA1 }, BA2: { action: SK.BA2 }, BA3: { action: SK.BA3 }, BA4: { action: SK.BA4 },
  MA: { action: SK.MA }, Skill: { action: SK.Skill }, Illation: { action: SK.FHA }, Transmutation: { action: SK.FMA },
  Liberation: { action: SK.Liberation }, EchoesLiberation: { action: SK.Liberation, echoesFirst: true },
  Intro: { action: SK.Intro, intro: true }, EchoSwap: { action: FALLACY, echoSwap: true }, Outro: { action: SK.Outro },
  Probe: { action: PROBE_ACTION, probe: true },
} satisfies Record<string, Press>;
/** Every press, in the order the workers index them. */
export const PRESSES: readonly Press[] = Object.values(P);

const echoes = (cut: (a: Action) => Action): Action[] => [cut(FALLACY), cut(SPACETREK_EXPLORER), cut(FORMRENDER)];
function write(steps: readonly Step[]): Action[] {
  return steps.flatMap(([p, cut]): Action[] => {
    if (p.echoesFirst) return [...echoes((a) => a.instaCancel()), SK.Liberation];
    const jump = cut === Cut.PlainJump ? [JUMP] : [];
    if (p.intro) return [CUT[cut](SK.Intro), CUT[cut](SK.EIntro), ...jump];
    if (p.echoesFirst && jump.length) return [...echoes((a) => a.instaCancel()), SK.Liberation, ...jump];
    if (p.echoSwap) return echoes((a) => a.instaSwap());
    if (p.probe) return [LANDING, PROBE_ACTION];
    return [CUT[cut](p.action), ...jump];
  });
}

// the stand-in, and what every visit she hands back to arrives on
const STAND_IN = new Rotation([LILY_PRESSES.IntroBase, waitFor(60 * 19, "teammates", true), LILY_PRESSES.Outro]);
// an opener needs an Intro chain to stand: the kit's loop, never reached in its one rotation
const SOME_LOOP: Step[] = [[P.Intro, Cut.None], [P.BA1, Cut.None], [P.BA2, Cut.Hold], [P.Illation, Cut.Insta], [P.Skill, Cut.Cancel],
  [P.EchoesLiberation, Cut.None], [P.BA1, Cut.Swap], [P.Outro, Cut.None]];
const PICK: Pick = { weapon: 0, echo: 0, mainstat: 0, sequence: 0, refine: 0, matrix: false, highSubs: false };
// Shorekeeper's weapon off WEAPON (an index into her loadout's weapons) and REFINE (its rank, 1-5)
const SK_PICK: Pick = { ...PICK, weapon: +(process.env.WEAPON ?? 0), refine: +(process.env.REFINE ?? 1) - 1 };
const MEMBERS = [member(SHOREKEEPER), member(LILY)];

// read on each Outro's cast, ahead of what it spends: the least any went out with (each needs its 100)
// ...and every other cast of hers checked against its own condition there too: the first that misses it
// ...and the Concerto she brings to her first Intro, ahead of its own: what the visit before it left her
// ...and the Concerto in hand on each of her own casts: the last one's is what the string has before its last press
let outroConcerto = Infinity, unmetCast: string | null = null, introConcerto = NaN, castConcerto = NaN;
const WATCH = new Buff({ name: "Explorer: Outro Concerto", updateBuffs: () => {
  const m = currentMember();
  if (casting(Cast.Intro) && Number.isNaN(introConcerto)) introConcerto = m.concerto / 100;
  if (currentCast().cast !== null && Number.isNaN(probed)) castConcerto = m.concerto / 100;
  if (casting(Cast.Outro)) {
    outroConcerto = Math.min(outroConcerto, m.concerto);
    return;
  }
  if (unmetCast === null && currentCast().castUnmet([m.energy, m.concerto, ...m.forte])) unmetCast = currentCast().name;
} });

/** `rotation` played in the duo for `sections` rotations; traced where a caller reads the rows' hits. `extra`
 *  is gear she also holds (a check's own hooks). */
export function fight(rotation: Rotation, sections: number, traced = false, extra: readonly Buff[] = []): { state: State; rows: Result[] } {
  setTracing(traced);
  const rots = [rotation, STAND_IN];
  const state = new State(MEMBERS.map((m) => m.name));
  MEMBERS.forEach((m, i) => {
    state.active = i;
    const c = comboOf(m.loadout, i === 0 ? SK_PICK : PICK);
    withTeam(state, () => {
      for (const g of m.loadout.pieces(c.weapon, c.echo, c.mainstat, c.sequence, c.matrix !== null, c.highSubs, 0)) equip(g, 1);
      if (i === 0) for (const g of [WATCH, ...extra]) equip(g, 1);
    });
  });
  state.active = 0;
  withTeam(state, () => equipEnemy(TUNE_BREAK_ENEMY));
  return { state, rows: runRotations(state, rots, sections).sections.flat() };
}

/** `repeat`: a loop played twice behind its opener, timed as the slower of the two — steady in every bar, not
 *  just forte, and as fast behind the opener as behind itself. */
export interface Job { loop: boolean; opener: readonly Step[]; steps: readonly Step[]; close: readonly Step[]; repeat?: boolean }
/** `carried`: the Concerto an opener leaves her next Intro (its hits landed in the meantime included). */
/** `concertoNow`: on her bar as the last press is cast, ahead of its own gain; `concerto` once every hit landed. */
export interface Reading { error?: string; steps: Step[]; lastStart: number; outroAt: number | null; concOk: boolean; concerto: number; concertoNow: number; forte: number; forteLeft: number; carried: number }

/** Plays a candidate: the opener (a loop's) and the steps, then the close. A `CancelOrNone` the engine
 *  refuses is played out and tried again. */
export function play(job: Job): Reading {
  let steps = job.steps.slice();
  for (;;) {
    const list = job.loop ? [SWAPIN, ...write(job.opener), ...write(steps), ...write(job.close)]
      : [SWAPIN, ...write(steps), ...write(job.close), ...write(SOME_LOOP)];
    const rotation = new Rotation(list);
    let error = rotation.error?.message;
    let reading: Reading | null = null;
    if (!error) {
      probed = NaN;
      probedForte = NaN;
      castConcerto = NaN;
      outroConcerto = Infinity;
      unmetCast = null;
      introConcerto = NaN;
      try {
        const played = fight(rotation, job.loop ? (job.repeat ? 3 : 2) : 1);
        reading = read(played, job.loop ? (job.repeat ? 2 : 1) : 0, steps);
        // a repeated loop is as slow as the slower of its two: the first behind the opener, the second behind itself
        if (job.repeat && reading.outroAt !== null) {
          const first = read(played, 1, steps).outroAt;
          reading.outroAt = first === null ? null : Math.max(first, reading.outroAt);
        }
      } catch (e) {
        error = String((e as Error).message);
      }
    }
    if (reading) return reading;
    // the press a refused cancel names, played out instead
    const k = steps.findIndex(([p, c], j) => c === Cut.CancelOrNone && job.steps[j]![1] === Cut.CancelOrNone && error!.startsWith(`${(p.action as ActionGroup).actions?.[0]?.name ?? p.action.name}:`) && /cancel/.test(error!));
    if (k < 0) return { error, steps, lastStart: NaN, outroAt: null, concOk: false, concerto: NaN, concertoNow: NaN, forte: NaN, forteLeft: NaN, carried: NaN };
    steps = steps.map((s, j) => (j === k ? [s[0], Cut.None] as const : s));
  }
}

/** Her visits in `rows`: each from its first press (the opener from frame 0) to its Outro, the bench's own
 *  waits taken out, with the energy her presses generate in it (unbuffed, nothing shared). */
export function visits({ state, rows }: { state: State; rows: Result[] }): { first: Action; frames: number; energy: number }[] {
  const game = (r: Result): number => state.gameOf(r.realStarts);
  const mine = rows.filter((r) => r.member === MEMBERS[0]!.name);
  const own = mine.filter((r) => !r.queued);
  const out: { first: Action; frames: number; energy: number }[] = [];
  for (let at = 0; at < own.length;) {
    const outro = own.findIndex((r, j) => j >= at && r.action.cast === Cast.Outro);
    if (outro < 0) break;
    let wait = 0;
    for (let j = at; j < outro; j++) if (own[j]!.action.gameWait) wait += game(own[j + 1]!) - game(own[j]!);
    const from = out.length ? game(own[at]!) : 0, to = game(own[outro]!);
    const energy = mine.filter((r) => game(r) >= from && game(r) < to)
      .reduce((n, r) => n + landedBullets(r as ResolvedSnapshot).reduce((e, b) => e + b.energy, 0) + Math.max(0, r.action.castEnergy), 0) / 100;
    out.push({ first: own[at]!.action, frames: to - from - wait, energy });
    at = outro + 1;
    while (at < own.length && own[at]!.action.cast !== Cast.Intro) at++;
  }
  return out;
}

// the visit searched (the opener's at 0, else the `visit`th Intro visit after it; the fight's last Intro
// starts a visit it never finishes), timed from its first press; the bench's
// own waits (a cooldown not back in its short cycle, on the game timer) left out of every frame after them
function read({ state, rows }: { state: State; rows: Result[] }, visitNo: number, steps: Step[]): Reading {
  const game = (r: Result): number => state.gameOf(r.realStarts);
  const own = rows.filter((r) => r.member === MEMBERS[0]!.name && !r.queued);
  let from = visitNo ? -1 : 0;
  for (let j = 0, n = 0; visitNo && j < own.length; j++) {
    if (own[j]!.action.cast === Cast.Intro && ++n === visitNo) {
      from = j;
      break;
    }
  }
  if (from < 0) return { error: "no Intro visit", steps, lastStart: NaN, outroAt: null, concOk: false, concerto: NaN, concertoNow: NaN, forte: NaN, forteLeft: NaN, carried: NaN };
  const visit = own.slice(from), zero = game(visit[0]!);
  const outro = visit.findIndex((r) => r.action.cast === Cast.Outro);
  const upTo = outro < 0 ? visit.length : outro;
  // a press cast outside its condition (an Illation short of 5 forte) is no string at all; the Outro's is concOk
  if (unmetCast) return { error: `${unmetCast}: cast outside its condition`, steps, lastStart: NaN, outroAt: null, concOk: false, concerto: NaN, concertoNow: NaN, forte: NaN, forteLeft: NaN, carried: NaN };
  const benchWait = (k: number): number => {
    let w = 0;
    for (let j = 0; j < k; j++) if (visit[j]!.action.gameWait) w += game(visit[j + 1]!) - game(visit[j]!);
    return w;
  };
  // her last press: not a wait, an echo or the probe
  let last = upTo - 1;
  while (last > 0 && (visit[last]!.action.cast === null || visit[last]!.action.cast === Cast.Echo)) last--;
  return {
    steps,
    lastStart: game(visit[last]!) - zero - benchWait(last),
    outroAt: outro < 0 ? null : game(visit[outro]!) - zero - benchWait(outro),
    concOk: outroConcerto >= SK.Outro.castMin![1]!,
    concerto: probed,
    concertoNow: castConcerto,
    forte: probedForte,
    forteLeft: state.slots[0]!.forte[0]!,
    carried: introConcerto,
  };
}

/** A candidate as the workers are handed it: each press by its place in `PRESSES`. */
export type Wire = { loop: boolean; opener: number[][]; steps: number[][]; close: number[][]; repeat?: boolean };
const steps = (s: readonly Step[]): number[][] => s.map(([p, c]) => [PRESSES.indexOf(p), c]);
const unsteps = (s: number[][]): Step[] => s.map(([p, c]) => [PRESSES[p!]!, c as Cut] as const);
export const toWire = (j: Job): Wire => ({ loop: j.loop, opener: steps(j.opener), steps: steps(j.steps), close: steps(j.close), repeat: j.repeat });
export const fromWire = (w: Wire): Job => ({ loop: w.loop, opener: unsteps(w.opener), steps: unsteps(w.steps), close: unsteps(w.close), repeat: w.repeat });
export const readingFromWire = (r: Reading & { steps: unknown }): Reading => ({ ...r, steps: unsteps(r.steps as unknown as number[][]) });
export const readingToWire = (r: Reading): Reading => ({ ...r, steps: steps(r.steps) as unknown as Step[] });
