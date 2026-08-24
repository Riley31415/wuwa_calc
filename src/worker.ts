/**
 * One team's build search, off the main thread. index.ts spawns a pool of these and feeds them the
 * roster a team at a time (see its own `ensureBestPicks()`); each reply is that team's best picks
 * plus the re-optimized main stat for every alternative the open filter boxes will show.
 *
 * Deliberately thin — all the actual work is `solver.ts`'s, which the fallback path calls directly
 * on the main thread, so there is only one implementation of the search to keep correct.
 */
import { solveTeam, teamFromNames } from "./solver.js";
import type { SolveRequest, SolveResponse } from "./solver.js";

// `self` is typed as a Window by the DOM lib this project compiles against; inside a worker it is
// a DedicatedWorkerGlobalScope, and the two disagree on `postMessage`'s signature. Narrowed to the
// two members actually used rather than pulling the WebWorker lib in for the whole project.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<SolveRequest>) => void) | null;
  postMessage: (message: SolveResponse) => void;
};

ctx.onmessage = ({ data }) => {
  const { picks, variants } = solveTeam(data.teamKey, teamFromNames(data.loadouts), data.filters);
  ctx.postMessage({ id: data.id, picks, variants });
};
