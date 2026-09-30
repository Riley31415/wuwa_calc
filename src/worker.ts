/** The solver's worker entry: the engine loads under a top-level await, so the page waits for this
 *  one message before it sends anything — a message sent sooner can land on no handler. */
import "./solver.js";

self.postMessage({ ready: true });

export {};
