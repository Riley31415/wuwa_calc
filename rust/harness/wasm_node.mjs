// load the MVP wasm build in node and run t144 through the JSON API; time it
import { readFileSync } from "node:fs";
const bytes = readFileSync(new URL("../target/mvp/wasm32-unknown-unknown/release/wuwa_engine.wasm", import.meta.url));
const { instance } = await WebAssembly.instantiate(bytes, {});
const ex = instance.exports;
const enc = new TextEncoder(), dec = new TextDecoder();
const call = (req) => {
  const b = enc.encode(JSON.stringify(req));
  const p = ex.alloc(b.length);
  new Uint8Array(ex.memory.buffer, p, b.length).set(b);
  ex.call(p, b.length);
  ex.dealloc(p, b.length);
  return JSON.parse(dec.decode(new Uint8Array(ex.memory.buffer, ex.reply_ptr(), ex.reply_len())));
};
const pick = (weapon, echo, mainstat) => ({ weapon, echo, mainstat, sequence: 0, refine: 0, matrix: false, highSubs: false });
const req = { op: "runTeam", team: "t144", members: ["MORNYE", "REBECCA", "LUCY"], combo: [pick(0, 0, 0), pick(0, 2, 5), pick(0, 1, 2)] };
const r = call(req);
console.log(r.sectionTotals, r.seconds * 60, r.total);
for (let k = 0; k < 50; k++) call(req);
const n = 1000, t0 = performance.now();
for (let k = 0; k < n; k++) call(req);
console.log("wasm (node16, mvp) ms/run", ((performance.now() - t0) / n).toFixed(3));
