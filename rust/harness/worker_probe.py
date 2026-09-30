# start one solver worker by hand in the page and report its load error or first message
import http.server, threading, functools, time
from playwright.sync_api import sync_playwright
ROOT = r"C:/Users/Riley/Documents/python/wuwa_calc_rust"
class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".wasm": "application/wasm"}
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8797), functools.partial(H, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    pg.goto("http://127.0.0.1:8797/rust/harness/blank.html")
    out = pg.evaluate("""() => new Promise((res) => {
      const w = new Worker('/dist/bundle/worker.js?v=1', { type: 'module' });
      w.onerror = (e) => res('worker error: ' + e.message + ' ' + e.filename + ':' + e.lineno);
      const t0 = performance.now();
      w.onmessage = (m) => { if (!('share' in m.data)) res(((performance.now() - t0) | 0) + 'ms message: ' + JSON.stringify(m.data).slice(0, 600)); };
      setTimeout(() => res('no final answer in 60s'), 60000);
      w.postMessage({ id: 0, teamKey: 't0', filters: { matrix: [], cost: 's0r1', weapons: [], echoes: [], mainstats: [], substats: [], sequences: [], refines: [], scoped: [] }, picks: null });
    })""")
    print(out)
    b.close()
srv.shutdown()
