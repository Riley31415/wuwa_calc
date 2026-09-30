// times the WebAssembly build in V8 — the engine the browser runs it on
import { readFileSync } from "node:fs";
const bytes = readFileSync(new URL("./target/wasm32-unknown-unknown/release/wuwa_engine.wasm", import.meta.url));
const { instance } = await WebAssembly.instantiate(bytes, {});
const { bench, section } = instance.exports;
const end = bench(1);
console.log("sections", [0, 1, 2, 3].map(section), "frames", end);
bench(50);
const n = Number(process.argv[2] ?? 3000);
const t0 = performance.now();
bench(n);
console.log("wasm ms/run", ((performance.now() - t0) / n).toFixed(4));
