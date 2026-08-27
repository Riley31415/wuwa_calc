"""The whole dev loop as one always-on process: `tsc --watch` and serve.py's hot-reload server.

serve.py already reloads the page the moment a watched .html/.css/.js changes, but a .ts edit
only reaches the browser once something has compiled it into dist/ — so on its own it needs a
second terminal running `npm run watch` beside it, and the two have to be started by hand every
session. This starts both, keeps them together, and is what the logon entry runs (see
`--install-autostart` below), so the site is simply always up at

    http://127.0.0.1:8731/src/index.html

    python dev.py                    ->  run in the foreground, ctrl-c stops both
    python dev.py 9000               ->  ...on another port
    python dev.py --install-autostart ->  start it at every logon, hidden, and start it now
    python dev.py --remove-autostart  ->  undo that (also just delete the .vbs it names)

Already-running is not an error: if the port is taken, this says so and exits 0, so the logon
entry firing while a terminal copy is up does nothing rather than crashing or double-compiling.

tsc is launched as node + the local typescript/bin/tsc rather than through npx: npx on Windows is
a .cmd shim, which means a shell, an extra console window under pythonw, and a process tree that
does not reliably die with its parent. --preserveWatchOutput keeps the log readable — tsc's default
watch mode clears the screen on every rebuild, which through a pipe is a stream of escape codes.
"""
import os
import socket
import subprocess
import sys
import threading
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path

import serve

ROOT = Path(__file__).resolve().parent
TSC = ROOT / "node_modules" / "typescript" / "bin" / "tsc"
TSC_LOG = ROOT / "tsc-watch.log"
SERVE_LOG = ROOT / "serve.log"
DEFAULT_PORT = 8731
VBS = Path(os.environ["APPDATA"]) / "Microsoft/Windows/Start Menu/Programs/Startup/wuwa-calc-dev.vbs"


def port_taken(port: int) -> bool:
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def start_tsc() -> subprocess.Popen | None:
    """`tsc --watch` in the background, its output tee'd to tsc-watch.log so a compile error is
    still readable when this is running hidden off the logon entry."""
    if not TSC.exists():
        print("no node_modules/typescript — run `npm install`; serving without a compiler")
        return None
    log = open(TSC_LOG, "w", encoding="utf-8", buffering=1)
    # CREATE_NO_WINDOW: under pythonw there is no console to inherit, and without this Windows
    # gives the child one of its own, which pops a black box on the desktop at every logon
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    return subprocess.Popen(
        ["node", str(TSC), "--watch", "--preserveWatchOutput"],
        cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, creationflags=flags,
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
    args = [a for a in sys.argv[1:]]
    if "--remove-autostart" in args:
        remove_autostart()
        return 0
    install = "--install-autostart" in args
    args = [a for a in args if not a.startswith("--")]
    port = int(args[0]) if args else DEFAULT_PORT

    if install:
        install_autostart(port)

    if port_taken(port):
        print(f"already serving on http://127.0.0.1:{port}/ - nothing to do")
        return 0

    tsc = start_tsc()
    threading.Thread(target=serve._watch_loop, daemon=True).start()
    handler = partial(serve.NoCacheHandler, directory=str(ROOT))
    httpd = ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"serving http://127.0.0.1:{port}/src/index.html  (tsc --watch + hot reload; ctrl-c to stop)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopping")
    finally:
        httpd.server_close()
        if tsc and tsc.poll() is None:
            tsc.terminate()
    return 0


if __name__ == "__main__":
    # under pythonw there is no console: send both streams to a log so a traceback is not lost
    if Path(sys.executable).name.lower() == "pythonw.exe":
        sys.stdout = sys.stderr = open(SERVE_LOG, "w", encoding="utf-8", buffering=1)
    raise SystemExit(main())
