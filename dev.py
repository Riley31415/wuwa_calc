"""The whole dev loop as one always-on process: a no-cache static server with hot reload, plus
the two compilers that produce what it serves (`tsc --watch` and `esbuild --watch`).

    python dev.py                    ->  run in the foreground, ctrl-c stops all three
    python dev.py 9000               ->  ...on another port
    python dev.py --serve-only       ->  the server alone, no compilers
    python dev.py --detach           ->  leave it running in the background and return at once

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


def _sweep_chunks() -> None:
    """Delete the chunks esbuild has stopped referencing. It content-hashes the shared chunk into a
    new `chunk-<hash>.js` on every rebuild and never removes the last one, so a long watch session
    piles up ~750KB per edit. A chunk newer than the entries is left alone: mid-rebuild that is the
    incoming one, written before the index.js that will name it."""
    bundle = ROOT / "dist" / "bundle"
    entries = [bundle / "index.js", bundle / "solver.js"]
    try:
        named = "".join(e.read_text(encoding="utf-8") for e in entries)
        newest = max(e.stat().st_mtime for e in entries)
    except OSError:
        return  # no bundle yet, or a read lost to a rebuild — nothing safe to delete
    for p in bundle.glob("chunk-*.js"):
        try:
            if p.name not in named and p.stat().st_mtime <= newest:
                p.unlink()
        except OSError:
            pass  # raced with esbuild's own write; the next sweep gets it


def _watch_loop() -> None:
    global _stamp
    last = _snapshot()
    with _lock:
        _stamp = str(zlib.crc32(repr(sorted(last.items())).encode()))
    while True:
        time.sleep(POLL_SECONDS)
        cur = _snapshot()
        if cur != last:
            # before the stamp, so the deletions are already in the snapshot the page reloads onto
            _sweep_chunks()
            cur = _snapshot()
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

    def log_message(self, fmt, *args):
        """One line per request, without the timestamp noise — and never onto an inherited pipe.

        A pipe whose reader has gone (the terminal or agent session that launched this, once it
        ends) blocks on write rather than failing, and since this runs on the handler thread every
        request would wedge behind it: the port stays open, nothing is answered, and `dev.py` sees
        a live listener and declines to restart. A file cannot block that way; a tty is a real
        console someone is watching, so that still gets the line."""
        line = "%s\n" % (fmt % args)
        try:
            if sys.stderr is not None and sys.stderr.isatty():
                sys.stderr.write(line)
                return
        except Exception:
            pass
        try:
            LOGS.mkdir(exist_ok=True)
            with open(LOGS / "access.log", "a", encoding="utf-8") as fh:
                fh.write(line)
        except Exception:
            pass


def port_taken(port: int) -> bool:
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def responding(port: int, timeout: float = 3.0) -> bool:
    """Whether something on the port actually answers, not merely accepts.

    A wedged server still holds the socket open, so "is the port taken" cannot tell a healthy copy
    from one that will never reply — and that is the difference between "nothing to do" and "the
    page is down for no reason"."""
    try:
        with socket.create_connection(("127.0.0.1", port), timeout) as s:
            s.settimeout(timeout)
            s.sendall(b"HEAD / HTTP/1.0\r\n\r\n")
            return s.recv(12).startswith(b"HTTP/")
    except OSError:
        return False


def listener_pid(port: int) -> int | None:
    """The pid holding the port, off netstat — used only to clear a wedged copy of this server."""
    try:
        out = subprocess.run(["netstat", "-ano"], capture_output=True, text=True, timeout=15).stdout
    except (OSError, subprocess.SubprocessError):
        return None
    for line in out.splitlines():
        parts = line.split()
        if len(parts) >= 5 and parts[0] == "TCP" and parts[1].endswith(f":{port}") and parts[3] == "LISTENING":
            return int(parts[4])
    return None


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




def pythonw() -> Path:
    """The windowless interpreter beside this one, so a detached copy has no console to show."""
    exe = Path(sys.executable)
    beside = exe.with_name("pythonw.exe")
    return beside if beside.exists() else exe


def detach() -> None:
    """This same script again without --detach, windowless and off this process tree, so the caller
    returns at once and the watchers outlive the terminal that started them."""
    LOGS.mkdir(exist_ok=True)
    log = open(LOGS / "dev.log", "w", encoding="utf-8", buffering=1)
    rest = [a for a in sys.argv[1:] if a != "--detach"]
    subprocess.Popen(
        [str(pythonw()), str(Path(__file__).resolve()), *rest], cwd=ROOT,
        stdout=log, stderr=subprocess.STDOUT,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(subprocess, "DETACHED_PROCESS", 0),
    )


def main() -> int:
    args = sys.argv[1:]
    serve_only = "--serve-only" in args
    positional = [a for a in args if not a.startswith("--")]
    port = int(positional[0]) if positional else DEFAULT_PORT

    if responding(port):
        print(f"already serving on http://127.0.0.1:{port}/ - nothing to do")
        return 0

    # Holding the socket without answering: a copy that wedged rather than exited. Left alone it
    # keeps the port and the page stays dark, so it is cleared and replaced rather than reported.
    if port_taken(port):
        pid = listener_pid(port)
        print(f"port {port} held by an unresponsive server (pid {pid}) - replacing it")
        if pid:
            subprocess.run(["taskkill", "/F", "/PID", str(pid)], capture_output=True)
        for _ in range(20):
            if not port_taken(port):
                break
            time.sleep(0.25)
        else:
            print(f"could not free port {port}")
            return 1

    # after the port check, so asking to detach onto a port already served is still a no-op
    if "--detach" in args:
        detach()
        print(f"serving http://127.0.0.1:{port}/index.html in the background (logs/dev.log)")
        return 0

    # clear whatever the last session left behind before the watch starts adding to it
    _sweep_chunks()

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
