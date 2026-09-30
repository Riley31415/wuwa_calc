# start N solver workers at once in a blank page and count how many post their ready
import http.server, threading, functools, sys
from playwright.sync_api import sync_playwright
ROOT = r"C:/Users/Riley/Documents/python/wuwa_calc_rust"
class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".wasm": "application/wasm"}
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8796), functools.partial(H, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
n = int(sys.argv[1]) if len(sys.argv) > 1 else 7
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    pg.goto("http://127.0.0.1:8796/rust/harness/blank.html")
    print(pg.evaluate("""(n) => new Promise((res) => {
      const t0 = performance.now(), got = [];
      for (let i = 0; i < n; i++) {
        const w = new Worker('/dist/bundle/worker.js?v=' + i, { type: 'module' });
        w.onmessage = () => got.push(i + '@' + ((performance.now() - t0) | 0));
        w.onerror = (e) => got.push(i + ' error ' + e.message);
      }
      setTimeout(() => res(got.join(' ') || 'none'), 8000);
    })""", n))
    b.close()
srv.shutdown()
