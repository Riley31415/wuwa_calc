"""The whole dev loop as one always-on process: a no-cache static server with hot reload, plus
the two compilers that produce what it serves (`tsc --watch` and `esbuild --watch`).

    python dev.py                    ->  run in the foreground, ctrl-c stops all three
    python dev.py 9000               ->  ...on another port
    python dev.py --serve-only       ->  the server alone, no compilers
    python dev.py --install-autostart ->  start it at every logon, hidden, and start it now
    python dev.py --remove-autostart  ->  undo that (also just delete the .vbs it names)

then http://127.0.0.1:8731/index.html.

Why not `python -m http.server`: it sends Last-Modified but no Cache-Control and no ETag, so
Chrome falls back to heuristic freshness and will happily serve a stale index.css or bundle on an
ordinary reload — indistinguishable from "the edit did nothing". This serves everything no-store,
and adds hot reload on top: a background thread rescans every watched .html/.css/.js file's mtime
a few times a second, and the script index.html loads polls `/__livereload` and reloads the page
the moment that scan sees anything change. No manual refresh after a fix lands on disk.

A .ts edit only reaches the browser once something has compiled it, which is why the compilers
live here too rather than in a second terminal — the site is simply always up and always current.

Use 127.0.0.1, not localhost: this binds IPv4 only, and on Windows "localhost" tries the IPv6
loopback (::1) first and falls back after a ~200ms stall, paid on every connection.

Already-running is not an error: if the port is taken, this says so and exits 0, so the logon
entry firing while a terminal copy is up does nothing rather than crashing or double-compiling.

tsc and esbuild are launched as node + their local bin rather than through npx: npx on Windows is
a .cmd shim, which means a shell, an extra console window under pythonw, and a process tree that
does not reliably die with its parent. --preserveWatchOutput keeps the log readable — tsc's
default watch mode clears the screen on every rebuild, which through a pipe is a stream of escape
codes.
"""
import os
import socket
import subprocess
import sys
import threading
import time
import zlib
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LOGS = ROOT / "logs"
TSC = ROOT / "node_modules" / "typescript" / "bin" / "tsc"
ESBUILD = ROOT / "node_modules" / "esbuild" / "bin" / "esbuild"
DEFAULT_PORT = 8731
VBS = Path(os.environ["APPDATA"]) / "Microsoft/Windows/Start Menu/Programs/Startup/wuwa-calc-dev.vbs"

# Concatenation only: tsc is still the compiler, this just folds its ~70 output modules into the
# two files the page actually loads (dist/bundle/index.js and the worker's dist/bundle/solver.js,
# plus a shared chunk) — unbundled, a cold load was ~600 module requests (eight workers each
# fetching the whole graph) and the workers came up staggered behind the browser's six-connection
# limit; bundled it is 18, and the search starts ~0.2s sooner. `--outbase` keeps the worker at the
# same relative path index.js finds it by (`new URL("./solver.js", import.meta.url)`).
ESBUILD_ARGS = [
    "dist/src/index.js", "dist/src/solver.js", "--bundle", "--splitting", "--format=esm",
    "--outdir=dist/bundle", "--outbase=dist/src", "--log-level=warning",
]

WATCH_EXTS = {".html", ".css", ".js"}
POLL_SECONDS = 0.4

# What /__livereload reports: a checksum of every watched file's path and mtime, not a counter — a
# counter restarts at 0 with the server, so two runs would repeat the same values, and the page
# keeps a cache of its own solved teams keyed on this (src/index.ts's own `loadSolves`), which has
# to survive a restart and still change the moment any source file does.
_stamp = "0"
_lock = threading.Lock()

def _snapshot() -> dict:
    """path -> mtime for every watched file. node_modules is excluded (huge, irrelevant, slow to
    walk every 400ms), and so is tsc's own output: what the page loads is esbuild's re-bundle of
    it a moment later, and watching both meant two reloads per edit, the first onto a bundle not
    yet rebuilt."""
    state = {}
    for p in ROOT.rglob("*"):
        if p.suffix not in WATCH_EXTS or "node_modules" in p.parts:
            continue
        if "dist" in p.parts and "bundle" not in p.parts:
            continue
        try:
            state[str(p)] = p.stat().st_mtime
        except OSError:
            pass  # deleted between the glob and the stat — treat as absent, not fatal
    return state


def _watch_loop() -> None:
    global _stamp
    last = _snapshot()
    with _lock:
        _stamp = str(zlib.crc32(repr(sorted(last.items())).encode()))
    while True:
        time.sleep(POLL_SECONDS)
        cur = _snapshot()
        if cur != last:
            with _lock:
                _stamp = str(zlib.crc32(repr(sorted(cur.items())).encode()))
            last = cur


class NoCacheHandler(SimpleHTTPRequestHandler):
    # HTTP/1.1 so the browser keeps one connection open across the whole request waterfall instead
    # of paying a fresh TCP handshake per file; SimpleHTTPRequestHandler defaults to 1.0.
    protocol_version = "HTTP/1.1"

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self):
        # polled by the reload script index.html loads — never touches the filesystem itself, just
        # reports whatever the watch thread last saw
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


def port_taken(port: int) -> bool:
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def start_watcher(name: str, bin_path: Path, args: list[str]) -> subprocess.Popen | None:
    """One compiler in the background, output tee'd to logs/<name>.log so a compile error is still
    readable when this is running hidden off the logon entry.

    CREATE_NO_WINDOW: under pythonw there is no console to inherit, and without this Windows gives
    the child one of its own, which pops a black box on the desktop at every logon."""
    if not bin_path.exists():
        print(f"no node_modules/{name} — run `npm install`; serving without it")
        return None
    LOGS.mkdir(exist_ok=True)
    log = open(LOGS / f"{name}.log", "w", encoding="utf-8", buffering=1)
    return subprocess.Popen(
        ["node", str(bin_path), *args], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )


def install_autostart(port: int) -> None:
    """A .vbs in the Startup folder rather than a scheduled task: it runs as this user with their
    PATH, needs no elevation, and is removed by deleting one file. WScript's Run with a window
    style of 0 is what keeps pythonw's own (already console-less) process off the taskbar too."""
    pythonw = Path(sys.executable).with_name("pythonw.exe")
    exe = pythonw if pythonw.exists() else Path(sys.executable)
    VBS.parent.mkdir(parents=True, exist_ok=True)
    VBS.write_text(
        'Set sh = CreateObject("WScript.Shell")\n'
        f'sh.CurrentDirectory = "{ROOT}"\n'
        f'sh.Run """{exe}"" ""{ROOT / "dev.py"}"" {port}", 0, False\n',
        encoding="utf-8",
    )
    print(f"autostart installed: {VBS}")


def remove_autostart() -> None:
    if VBS.exists():
        VBS.unlink()
        print(f"autostart removed: {VBS}")
    else:
        print(f"no autostart entry at {VBS}")


def main() -> int:
    args = sys.argv[1:]
    if "--remove-autostart" in args:
        remove_autostart()
        return 0
    install = "--install-autostart" in args
    serve_only = "--serve-only" in args
    positional = [a for a in args if not a.startswith("--")]
    port = int(positional[0]) if positional else DEFAULT_PORT

    if install:
        install_autostart(port)
    if port_taken(port):
        print(f"already serving on http://127.0.0.1:{port}/ - nothing to do")
        return 0

    children = []
    if not serve_only:
        # esbuild's inputs are tsc's outputs, so on a checkout with no dist/ yet it has nothing to
        # bundle until the first tsc pass lands; its watch picks that up on its own.
        # `--watch=forever`, not `--watch`: plain watch mode stops itself the moment its stdin
        # closes (esbuild's guard against outliving a parent), and under pythonw at logon there is
        # no stdin to inherit, so it quit before the first edit. This process terminates it below.
        children = [
            start_watcher("tsc", TSC, ["--watch", "--preserveWatchOutput"]),
            start_watcher("esbuild", ESBUILD, [*ESBUILD_ARGS, "--watch=forever"]),
        ]

    threading.Thread(target=_watch_loop, daemon=True).start()
    httpd = ThreadingHTTPServer(("127.0.0.1", port), partial(NoCacheHandler, directory=str(ROOT)))
    what = "hot reload" if serve_only else "tsc --watch + esbuild --watch + hot reload"
    print(f"serving http://127.0.0.1:{port}/index.html  ({what}; ctrl-c to stop)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopping")
    finally:
        httpd.server_close()
        for child in children:
            if child and child.poll() is None:
                child.terminate()
    return 0


if __name__ == "__main__":
    # under pythonw there is no console: send both streams to a log so a traceback is not lost
    if Path(sys.executable).name.lower() == "pythonw.exe":
        LOGS.mkdir(exist_ok=True)
        sys.stdout = sys.stderr = open(LOGS / "dev.log", "w", encoding="utf-8", buffering=1)
    raise SystemExit(main())
