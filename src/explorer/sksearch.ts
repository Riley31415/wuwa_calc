/**
 * Shorekeeper's fastest loop and the fastest opener it plays behind, and the fastest opener with the fastest
 * loop behind that. Basic 1 first (her swap-in) or her Intro, the Liberation once anywhere, the echoes right
 * before it or as the swap, every string run to an Outro with 100 Concerto; a loop leaves the forte it arrived with.
 *
 * A shortest-path search: each round grows the strings whose last press starts earliest, every next press
 * played in parallel on the workers (skbench.ts, untraced), and a string is dropped only where one ending the
 * same way is no later and no worse on Concerto landed, in hand as its last press is cast, and still to land
 * past it (read off the engine, not the kit's numbers, as is the forte); a string with a press cast outside
 * its condition is dropped.
 * The fastest opener gets the fastest loop behind it. For the fastest loop, the opener that leaves exactly LEFT
 * (1) forte and carries the most Concerto into the next Intro, of the OPENERS (200) fastest that do, has the
 * loops searched behind it, and the best one is then tried behind the others for the fastest opener it allows.
 *
 *     npx tsc && node dist/src/explorer/sksearch.js
 *
 * PRELOAD=1 asks the opener to leave 1 forte. START=ba123 | ba1 fixes how the opener begins: Basic 1-3, or
 * Basic 1, cancelled into the Liberation. KEEP, LEFT, OPENERS, WORKERS, BATCH: results shown, the forte the
 * loop's opener leaves, openers it is picked from,
 * threads, strings grown a round. CANCEL/INSTA/MASH/SWAP override the delays (frames); WEAPON (an index into
 * her loadout's weapons) and REFINE (1-5) pick her weapon, R1 signature by default.
 */
import { Worker } from "node:worker_threads";
import { writeFileSync, mkdirSync } from "node:fs";
import { Cut, P, toWire, readingFromWire } from "./skbench.js";
import type { Job, Press, Reading, Step } from "./skbench.js";
import type { Action, ActionGroup } from "../engine/rotation.js";

const KEEP = Number(process.env.KEEP ?? 10), WORKERS = Number(process.env.WORKERS ?? 12), BATCH = Number(process.env.BATCH ?? 8);

// the presses a string may add, the high-Concerto ones first so a good string is found early
const GROWS: Press[] = [P.Skill, P.Illation, P.Transmutation, P.Liberation, P.EchoesLiberation, P.MA, P.BA4, P.BA3, P.BA2, P.BA1];
const LIBERATIONS = new Set<Press>([P.Liberation, P.EchoesLiberation]);
const SPENDS = new Set<Press>([P.Illation, P.Transmutation]);
// the Collapsed Cores each press makes (its hooks', so not on its bullets); 5 held at most
const CORES = new Map<Press, number>([[P.BA1, 1], [P.BA2, 2], [P.BA3, 1], [P.BA4, 1], [P.MA, 1]]);
// what Basic 1 may not directly follow (its notAfter, which a dodge cancel between makes the dodge)
const BA1_NOT_AFTER = new Set<Press>([P.BA1, P.BA2, P.BA3, P.MA, P.Transmutation, P.Skill]);

const own = (a: Action): Action => (a as ActionGroup).actions?.[0] ?? a;
// a press's own forte and Concerto, off its bullets and its cast
const forteOf = (p: Press): number => own(p.action).bullets.reduce((n, b) => n + b.forte1, 0) + own(p.action).castForte[0]!;
const concertoOf = (p: Press): number => (own(p.action).bullets.reduce((n, b) => n + b.concerto, 0) + own(p.action).castConcerto) / 100;

/** The cuts `prev` may take into `next` (null: into the close, `echoAtEnd` where the echoes are the swap):
 *  into Illation a hold, a cancel where the engine takes one or an insta cut, none letting go before the hold
 *  would (a hold nowhere else, no mash anywhere), into the
 *  Skill or the Liberation a cancel where the engine takes one, Illation's own an insta cut (an insta jump
 *  into a plunge or Transmutation), a jump into a plunge or Transmutation, Basic 1 played out or dodged into,
 *  the Liberation played out. */
function cutsInto(prev: Press, next: Press | null, echoAtEnd: boolean): Cut[] {
  const air = next === P.MA || next === P.Transmutation;
  if (next === null) return echoAtEnd ? [prev === P.Illation ? Cut.Insta : prev === P.Skill ? Cut.CancelOrNone : Cut.None] : [Cut.Swap];
  // out of the Intro or the Liberation into a plunge, a jump cancel or the press played out and a plain jump
  if (air && (prev === P.Intro || LIBERATIONS.has(prev))) return [Cut.Jump, Cut.PlainJump];
  if (LIBERATIONS.has(prev)) return [Cut.None];
  if (prev === P.Illation) return air ? [Cut.InstaJump] : [Cut.Insta];
  if (next === P.Illation) return [Cut.Hold, Cut.CancelOrNone, Cut.Insta];
  if (air) return [Cut.Jump];
  if (next === P.Skill || LIBERATIONS.has(next)) return [Cut.CancelOrNone];
  if (next === P.BA2 || next === P.BA3 || next === P.BA4) return [Cut.None];
  return [Cut.None, Cut.Dodge];
}

interface Node { steps: Step[]; at: number; forte: number; cores: number; skill: boolean; lib: boolean; echo: boolean; conc: number }
function legal(next: Press, prev: Press, n: Node): boolean {
  if (next === P.Skill && n.skill) return false;
  if (LIBERATIONS.has(next) && n.lib) return false;
  if (SPENDS.has(next) && n.forte < 5) return false;
  if (next === P.BA2) return prev === P.BA1 || prev === P.MA || prev === P.Transmutation || prev === P.Skill;
  if (next === P.BA3) return prev === P.BA2 || prev === P.Intro;
  if (next === P.BA4) return prev === P.BA3;
  return true;
}

// a worker pool, each candidate handed to the next in turn
const workers = await Promise.all(Array.from({ length: WORKERS }, () => new Promise<Worker>((ok) => {
  const w = new Worker(new URL("./skworker.js", import.meta.url));
  w.once("message", () => ok(w));
})));
const waiting = new Map<number, (r: Reading) => void>();
for (const w of workers) w.on("message", ({ id, out }) => { waiting.get(id)!(readingFromWire(out)); waiting.delete(id); });
let nextId = 0, runs = 0;
const evaluate = (job: Job): Promise<Reading> => new Promise((ok) => {
  const id = nextId++;
  waiting.set(id, ok);
  runs++;
  workers[id % WORKERS]!.postMessage({ id, job: toWire(job) });
});

interface Seen { at: number; conc: number; now: number; pend: number }
interface Found { steps: Step[]; echoAtEnd: boolean; frames: number; forteLeft: number; carried: number }

/** The KEEP fastest strings from `start`, a loop's behind `opener`. `wantForte`: the forte it must leave
 *  (a preload opener at least 1, a steady loop exactly what it arrived with); null for any. */
async function search(start: Node, opener: Step[] | null, wantForte: (left: number) => boolean, keep = KEEP): Promise<Found[]> {
  const loop = opener !== null;
  const job = (steps: Step[], close: Step[]): Job => ({ loop, opener: opener ?? [], steps, close });
  const heap: Node[] = [start];
  const pop = (): Node => {
    let best = 0;
    for (let i = 1; i < heap.length; i++) if (heap[i]!.at < heap[best]!.at) best = i;
    return heap.splice(best, 1)[0]!;
  };
  const seen = new Map<string, Seen[]>();
  const results: Found[] = [];
  for (;;) {
    const kth = results.length >= keep ? results.map((r) => r.frames).sort((a, b) => a - b)[keep - 1]! : Infinity;
    const batch: Node[] = [];
    while (heap.length && batch.length < BATCH) {
      const n = pop();
      if (n.at > kth) {
        heap.length = 0;
        break;
      }
      batch.push(n);
    }
    if (!batch.length) break;
    const tasks: Promise<unknown>[] = [];
    const children: { parent: Node; next: Press; cut: Cut; forte: number; cores: number; skill: boolean; lib: boolean; echo: boolean; r: Reading }[] = [];
    for (const n of batch) {
      const last = n.steps[n.steps.length - 1]![0];
      // close it where its Concerto could reach 100: the echoes as the swap where they haven't gone before the Liberation
      if (n.lib && n.conc >= 75) {
        const echoAtEnd = !n.echo;
        const steps = [...n.steps.slice(0, -1), [last, cutsInto(last, null, echoAtEnd)[0]!] as const];
        // a finished loop is played twice, so it has to stand behind itself as well as behind the opener
        tasks.push(evaluate({ ...job(steps, echoAtEnd ? [[P.EchoSwap, Cut.Swap], [P.Outro, Cut.None]] : [[P.Outro, Cut.None]]), repeat: loop }).then((r) => {
          if (r.error || !r.concOk || r.outroAt === null || !wantForte(r.forteLeft)) return;
          results.push({ steps: r.steps, echoAtEnd, frames: r.outroAt, forteLeft: r.forteLeft, carried: r.carried });
        }));
      }
      if (n.steps.length >= 15 || (n.lib && n.conc >= 170)) continue;
      for (const next of GROWS) {
        if (!legal(next, last, n)) continue;
        const spends = SPENDS.has(next);
        const cores = spends ? 0 : Math.min(5, n.cores + (CORES.get(next) ?? 0));
        for (const cut of cutsInto(last, next, false)) {
          if (next === P.BA1 && cut !== Cut.Dodge && BA1_NOT_AFTER.has(last)) continue;
          // played plain, then the probe and the Outro: where it starts, and what the string banks once it lands
          const steps = [...n.steps.slice(0, -1), [last, cut] as const, [next, Cut.None] as const];
          tasks.push(evaluate(job(steps, [[P.Probe, Cut.None], [P.Outro, Cut.None]])).then((r) => {
            if (!r.error && !Number.isNaN(r.concerto)) children.push({ parent: n, next, cut, forte: Math.min(5, r.forte), cores, skill: n.skill || next === P.Skill, lib: n.lib || LIBERATIONS.has(next), echo: n.echo || next === P.EchoesLiberation, r });
          }));
        }
      }
    }
    await Promise.all(tasks);
    // Illation only comes out of a hold: a cut into it can't let go before the hold off the same string would
    const holdAt = new Map<Node, number>();
    for (const ch of children) if (ch.next === P.Illation && ch.cut === Cut.Hold) holdAt.set(ch.parent, ch.r.lastStart);
    for (const ch of children) {
      // a string that closes still grows: its Outro may wait on Concerto that more presses bring in sooner
      if (ch.next === P.Illation && ch.cut !== Cut.Hold && ch.r.lastStart < (holdAt.get(ch.parent) ?? -Infinity)) continue;
      const key = `${GROWS.indexOf(ch.next)}|${ch.forte}|${ch.cores}|${ch.skill}|${ch.lib}|${ch.echo}`;
      const kept = seen.get(key) ?? [];
      // in hand as the last press is cast (an Outro waits on what isn't) and still to land past it (what lands
      // after a swap carries into the next Intro, an Illation's butterflies) count as well as what has landed by the probe
      const at = ch.r.lastStart, conc = ch.r.concerto, now = ch.r.concertoNow, pend = conc - now;
      const beats = (k: Seen): boolean => k.at <= at && k.conc >= conc && k.now >= now && k.pend >= pend;
      if (kept.some(beats)) continue;
      seen.set(key, [...kept.filter((k) => !(at <= k.at && conc >= k.conc && now >= k.now && pend >= k.pend)), { at, conc, now, pend }]);
      heap.push({ steps: ch.r.steps.map((s, j, all) => (j === all.length - 1 ? [s[0], Cut.None] as const : s)), at, forte: ch.forte, cores: ch.cores, skill: ch.skill, lib: ch.lib, echo: ch.echo, conc });
    }
  }
  return results.sort((a, b) => a.frames - b.frames).slice(0, keep);
}

// how a step reads in the output: the press's short name, its cut, the close after the last
const NAMES = new Map<Press, string>([[P.BA1, "BA1"], [P.BA2, "BA2"], [P.BA3, "BA3"], [P.BA4, "BA4"], [P.MA, "MA"], [P.Skill, "Skill"],
  [P.Illation, "Illation"], [P.Transmutation, "Transmutation"], [P.Liberation, "Liberation"], [P.EchoesLiberation, "echoes → Liberation"], [P.Intro, "Intro"]]);
const CUT_NAMES: Partial<Record<Cut, string>> = { [Cut.Cancel]: "cancel", [Cut.CancelOrNone]: "cancel", [Cut.Insta]: "insta", [Cut.Dodge]: "dodge", [Cut.Jump]: "jump", [Cut.Hold]: "hold", [Cut.Swap]: "swap", [Cut.InstaJump]: "instajump" };
const label = (f: Found): string => f.steps.map(([p, c], j) => {
  const cut = j === f.steps.length - 1 && f.echoAtEnd ? Cut.Swap : c;
  if (cut === Cut.PlainJump) return `${NAMES.get(p)} → Jump`;
  return `${NAMES.get(p)}${(LIBERATIONS.has(p) && cut !== Cut.Jump) || !CUT_NAMES[cut] ? "" : `.${CUT_NAMES[cut]}`}`;
}).join(" → ") + (f.echoAtEnd ? " → echoes → Outro" : " → Outro");

/** The whole visit as the rotation writes it, the close included, for the next search to play first. */
const written = (f: Found): Step[] => [...f.steps.slice(0, -1), [f.steps[f.steps.length - 1]![0], f.echoAtEnd ? f.steps[f.steps.length - 1]![1] : Cut.Swap],
  ...(f.echoAtEnd ? [[P.EchoSwap, Cut.Swap] as const] : []), [P.Outro, Cut.None]];

function show(title: string, found: Found[]): void {
  console.log(`${title}: ${found.length} kept, ${runs} runs`);
  for (const f of found) console.log(`  ${(f.frames / 60).toFixed(2)}s forte ${f.forteLeft}  ${label(f)}`);
}

const preload = process.env.PRELOAD === "1";
const t0 = performance.now();
// a fixed start is played once, for where its Liberation starts and what it has banked
const FIXED: Partial<Record<string, Step[]>> = {
  ba123: [[P.BA1, Cut.None], [P.BA2, Cut.None], [P.BA3, Cut.CancelOrNone], [P.Liberation, Cut.None]],
  ba1: [[P.BA1, Cut.CancelOrNone], [P.Liberation, Cut.None]],
};
const fixed = FIXED[process.env.START ?? ""];
let first: Node = { steps: [[P.BA1, Cut.None]], at: 0, forte: forteOf(P.BA1), cores: 1, skill: false, lib: false, echo: false, conc: concertoOf(P.BA1) };
if (fixed) {
  const r = await evaluate({ loop: false, opener: [], steps: fixed, close: [[P.Probe, Cut.None], [P.Outro, Cut.None]] });
  if (r.error) throw new Error(`START=${process.env.START}: ${r.error}`);
  first = { steps: r.steps, at: r.lastStart, forte: Math.min(5, r.forte),
    cores: Math.min(5, fixed.reduce((n, [p]) => n + (CORES.get(p) ?? 0), 0)), skill: false, lib: true, echo: false, conc: r.concerto };
}
const intro = (left: number): Node => ({ steps: [[P.Intro, Cut.None]], at: 0, forte: left, cores: 0, skill: false, lib: false, echo: false, conc: concertoOf(P.Intro) });
const loopsBehind = (o: Found): Promise<Found[]> => search(intro(o.forteLeft), written(o), (l) => l === o.forteLeft);
const pairing = (o: Found, l: Found): string => `  loop ${(l.frames / 60).toFixed(2)}s  opener ${(o.frames / 60).toFixed(2)}s forte ${o.forteLeft} carried ${o.carried.toFixed(1)}
    ${label(o)}
    ${label(l)}`;

// the fastest opener: the fastest one, then the fastest steady loop behind it
const openers = await search(first, null, (left) => !preload || left >= 1);
show(`opener${preload ? ", leaving forte" : ""}`, openers);
const fastest = openers[0]!;
const behindFastest = await loopsBehind(fastest);
console.log("fastest opener:");
for (const l of behindFastest) console.log(pairing(fastest, l));

// the fastest loop: of the OPENERS fastest openers leaving exactly LEFT forte, the one carrying the most
// Concerto into the next Intro (the faster on a tie) has the fastest steady loop searched behind it; then
// that loop is tried behind each of them, for the fastest opener it plays behind as fast
const LEFT = Number(process.env.LEFT ?? 1);
const carriers = await search(first, null, (left) => left === LEFT, Number(process.env.OPENERS ?? 200));
const richest = carriers.reduce((a, b) => (b.carried > a.carried || (b.carried === a.carried && b.frames < a.frames) ? b : a));
console.log(`${carriers.length} openers leaving ${LEFT} forte; the most Concerto carried: ${richest.carried.toFixed(1)}`);
const loops = await loopsBehind(richest);
const fits: { opener: Found; loop: Found }[] = [];
if (loops.length) {
  const loop = loops[0]!;
  await Promise.all(carriers.map(async (o) => {
    const r = await evaluate({ loop: true, opener: written(o), steps: loop.steps, close: loop.echoAtEnd ? [[P.EchoSwap, Cut.Swap], [P.Outro, Cut.None]] : [[P.Outro, Cut.None]], repeat: true });
    if (!r.error && r.concOk && r.outroAt !== null && r.outroAt <= loop.frames && r.forteLeft === LEFT) fits.push({ opener: o, loop });
  }));
  fits.sort((a, b) => a.opener.frames - b.opener.frames);
}
console.log(`fastest loop: ${runs} runs`);
for (const l of loops) console.log(pairing(richest, l));
console.log("  the fastest openers it plays behind as fast:");
for (const f of fits.slice(0, KEEP)) console.log(pairing(f.opener, f.loop));
mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
writeFileSync(new URL(`./out/sksearch${preload ? "-preload" : ""}.json`, import.meta.url), JSON.stringify({
  fastestOpener: behindFastest.map((l) => [label(fastest), label(l)]),
  fastestLoop: fits.slice(0, KEEP).map((f) => [label(f.opener), label(f.loop)]),
}, null, 1));
console.log(`${Math.round(performance.now() - t0)}ms`);
for (const w of workers) await w.terminate();
