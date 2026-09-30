# serve the worktree and load its page in headless Chromium: console errors, and what the table shows
import http.server, threading, functools, sys, time
from playwright.sync_api import sync_playwright
ROOT = r"C:/Users/Riley/Documents/python/wuwa_calc_rust"
class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".wasm": "application/wasm"}
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
    def log_message(self, *a): pass
    def handle(self):
        try:
            super().handle()
        except ConnectionError:
            pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8798), functools.partial(H, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
wait = float(sys.argv[1]) if len(sys.argv) > 1 else 20
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    logs = []
    pg.on("console", lambda m: logs.append(f"{m.type}: {m.text}"))
    pg.on("pageerror", lambda e: logs.append(f"pageerror: {e}"))
    def on_worker(w):
        w.on("console", lambda m: logs.append(f"worker {m.type}: {m.text}"))
    pg.on("worker", on_worker)
    pg.on("response", lambda r: logs.append(f"http {r.status}: {r.url}") if r.status >= 400 or "worker" in r.url or "wasm" in r.url or "solver" in r.url else None)
    import os
    pg.add_init_script("""(() => { const W = window.Worker; window.Worker = function (u, o) { const w = new W(u, o);
      const post = w.postMessage.bind(w); w.postMessage = (m) => { console.log('to worker ' + JSON.stringify(m).slice(0, 300)); post(m); };
      w.addEventListener('message', (e) => console.log('from worker ' + JSON.stringify(e.data).slice(0, 200)));
      w.addEventListener('error', (e) => console.log('worker error ' + e.message));
      return w; }; })()""")
    pg.goto(os.environ.get("PAGE", "http://127.0.0.1:8798/index.html"))
    pg.wait_for_timeout(wait * 1000)
    if os.environ.get("CLICK"):
        pg.evaluate(os.environ["CLICK"])
        pg.wait_for_timeout(5000)
    print("in-page probe:", pg.evaluate("""() => new Promise((res) => {
      const w = new Worker('/dist/bundle/worker.js?v=probe', { type: 'module' });
      w.onerror = (e) => res('worker error: ' + e.message);
      w.onmessage = (m) => { if (!('share' in m.data)) res('answered ' + JSON.stringify(m.data).slice(0, 80)); };
      setTimeout(() => res('no answer in 20s'), 20000);
      w.postMessage({ id: 0, teamKey: 't0', filters: { matrix: [], cost: 's0r1', weapons: [], echoes: [], mainstats: [], substats: [], sequences: [], refines: [], scoped: [] }, picks: null });
    })"""))
    for w in pg.workers:
        try:
            print("worker", w.url[-30:], w.evaluate("String(self.onmessage).slice(0, 80)"))
        except Exception as e:
            print("worker eval failed", e)
    rows = pg.evaluate(r"[...document.querySelectorAll('tr')].map(r => r.innerText.replace(/\s+/g, ' ').slice(0, 160))")
    print("\n".join(logs[:30]))
    print("--- body")
    print(pg.evaluate("document.body.innerText.slice(0, " + os.environ.get("LEN", "1500") + ")"))
    print("--- rows")
    print("\n".join(rows))
    b.close()
srv.shutdown()
