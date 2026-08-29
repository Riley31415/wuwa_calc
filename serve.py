"""Dev server for the rotation viewer.

`python -m http.server` sends Last-Modified but no Cache-Control and no ETag, so Chrome falls
back to heuristic freshness and will happily serve a stale index.css or dist/index.js on an
ordinary reload — which is indistinguishable from "the edit did nothing".

This is that server with caching turned off, plus hot reload: a background thread rescans every
watched .html/.css/.js file's mtime a few times a second, and the tiny script index.html loads
polls a version endpoint and reloads the page the moment that scan sees anything change. No
manual refresh needed after a fix lands on disk (or after `npx tsc` finishes rebuilding dist/).

    python serve.py            ->  http://127.0.0.1:8731/
    python serve.py 9000       ->  http://127.0.0.1:9000/

This serves; it does not compile. A .ts edit only reaches the browser once something has built
dist/, so run it beside `npm run watch` — or just use dev.py, which is this plus that compiler as
one process, and is what the logon entry starts (`python dev.py --install-autostart`).

Use 127.0.0.1, not localhost: this binds IPv4 only, and on Windows "localhost" tries the IPv6
loopback (::1) first and falls back after a ~200ms stall — paid on *every* connection, which adds
up fast across the dozen-plus separate module files the unbundled dist/ ships as (see index.ts's
own header on why there's no bundler here).
"""
import sys
import threading
import zlib
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

WATCH_EXTS = {".html", ".css", ".js"}
POLL_SECONDS = 0.4

_version = 0
# What /__livereload actually reports: a checksum of every watched file's path and mtime, not
# `_version` — a counter restarts at 0 with the server, so two runs would repeat the same values,
# and the page keeps a cache of its own solved teams keyed on this (index.ts's own `loadSolves`),
# which has to survive a restart and still change the moment any source file does.
_stamp = "0"
_lock = threading.Lock()


def _stamp_of(state: dict) -> str:
    return str(zlib.crc32(repr(sorted(state.items())).encode()))


def _snapshot() -> dict:
    """path -> mtime for every watched file, node_modules excluded (huge, irrelevant, and slow
    to walk every 400ms for no reason)."""
    root = Path(__file__).resolve().parent
    state = {}
    for p in root.rglob("*"):
        if p.suffix not in WATCH_EXTS or "node_modules" in p.parts:
            continue
        # tsc's own output is not what the page loads any more — esbuild re-bundles it into
        # dist/bundle a moment later (dev.py), and that is the change worth reloading on. Watching
        # both meant two reloads per edit, the first onto a bundle not yet rebuilt.
        if "dist" in p.parts and "src" in p.parts:
            continue
        try:
            state[str(p)] = p.stat().st_mtime
        except OSError:
            pass  # deleted between the glob and the stat — treat as absent, not fatal
    return state


def _watch_loop() -> None:
    global _version, _stamp
    last = _snapshot()
    with _lock:
        _stamp = _stamp_of(last)
    while True:
        time.sleep(POLL_SECONDS)
        cur = _snapshot()
        if cur != last:
            with _lock:
                _version += 1
                _stamp = _stamp_of(cur)
            last = cur


class NoCacheHandler(SimpleHTTPRequestHandler):
    # HTTP/1.1 so the browser keeps one connection open across the whole module-import waterfall
    # (dozens of separate dist/*.js files, no bundler — see index.ts's own header) instead of
    # paying a fresh TCP handshake per file; SimpleHTTPRequestHandler defaults to 1.0 (a new
    # connection every request), which is the difference between one slow connection and ~40 of them.
    protocol_version = "HTTP/1.1"

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self):
        # polled by the reload script index.html loads (see LIVERELOAD_SNIPPET below) — never
        # touches the filesystem itself, just reports whatever the watch thread last saw
        if self.path == "/__livereload":
            with _lock:
                body = _stamp.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def log_message(self, fmt, *args):  # one line per request, without the timestamp noise
        sys.stderr.write("%s\n" % (fmt % args))


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8731
    threading.Thread(target=_watch_loop, daemon=True).start()
    handler = partial(NoCacheHandler, directory=".")
    print(f"serving http://127.0.0.1:{port}/  (no-store, hot reload; ctrl-c to stop)")
    ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
