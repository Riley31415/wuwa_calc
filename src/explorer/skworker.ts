/** A search worker: plays each candidate it is handed (skbench.ts) and posts back what it read. */
import { parentPort } from "node:worker_threads";
import { play, fromWire, readingToWire } from "./skbench.js";
import type { Wire } from "./skbench.js";

parentPort!.on("message", ({ id, job }: { id: number; job: Wire }) => parentPort!.postMessage({ id, out: readingToWire(play(fromWire(job))) }));
parentPort!.postMessage({ ready: true });
