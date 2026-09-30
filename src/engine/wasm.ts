/**
 * The engine: a WebAssembly module (rust/, built into dist/engine.wasm), loaded once per page and
 * once per worker, spoken to in JSON. Every fight runs in there; this side only asks.
 */

interface Exports {
  memory: WebAssembly.Memory;
  alloc(n: number): number;
  dealloc(p: number, n: number): void;
  call(p: number, n: number): void;
  reply_ptr(): number;
  reply_len(): number;
}

/** The compiled module: fetched beside the bundle in a browser or worker, read off disk in node. */
async function load(): Promise<Exports> {
  const url = new URL("../engine.wasm", import.meta.url);
  let module: WebAssembly.WebAssemblyInstantiatedSource;
  if (typeof process !== "undefined" && process.versions?.node) {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const { existsSync } = await import("node:fs");
    // tsc's dist/src/engine/ sits two levels under dist/, the bundle one
    const deeper = new URL("../../engine.wasm", import.meta.url);
    const path = existsSync(fileURLToPath(url)) ? url : deeper;
    module = await WebAssembly.instantiate(await readFile(fileURLToPath(path)), {});
  } else {
    module = await WebAssembly.instantiateStreaming(fetch(url), {});
  }
  return module.instance.exports as unknown as Exports;
}

const engine = await load();
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** One request to the engine, and its reply. */
export function call<T>(request: object): T {
  const bytes = encoder.encode(JSON.stringify(request));
  const p = engine.alloc(bytes.length);
  new Uint8Array(engine.memory.buffer, p, bytes.length).set(bytes);
  engine.call(p, bytes.length);
  engine.dealloc(p, bytes.length);
  const reply = JSON.parse(decoder.decode(new Uint8Array(engine.memory.buffer, engine.reply_ptr(), engine.reply_len())));
  if (reply && typeof reply === "object" && "error" in reply) throw new Error(`engine: ${reply.error}`);
  return reply as T;
}
