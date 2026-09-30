"""Build the engine into dist/engine.wasm: nightly, std rebuilt at the MVP target so node 16 (precompute)
loads the same module the browser does. `python rust/build_wasm.py` from anywhere; exits non-zero on a
compile error and leaves the last good dist/engine.wasm in place."""
import os
import shutil
import subprocess
import sys
from pathlib import Path

CRATE = Path(__file__).resolve().parent
OUT = CRATE / "target" / "mvp" / "wasm32-unknown-unknown" / "release" / "wuwa_engine.wasm"
DEST = CRATE.parent / "dist" / "engine.wasm"


def build(log=None) -> bool:
    """@param log  a file the compiler's output goes to; the terminal when None."""
    env = {**os.environ, "RUSTFLAGS": "-C target-cpu=mvp"}
    cmd = [
        "cargo", "+nightly", "build", "--release", "--lib", "--target", "wasm32-unknown-unknown",
        "-Z", "build-std=std,panic_abort", "--target-dir", "target/mvp",
    ]
    if subprocess.run(cmd, cwd=CRATE, env=env, stdout=log, stderr=subprocess.STDOUT if log else None).returncode != 0:
        return False
    # an unchanged module keeps its mtime, so a no-op build reloads no page
    if DEST.exists() and DEST.read_bytes() == OUT.read_bytes():
        return True
    DEST.parent.mkdir(exist_ok=True)
    # through a temp name, so a page mid-fetch never reads half a module
    tmp = DEST.with_suffix(".wasm.tmp")
    shutil.copyfile(OUT, tmp)
    os.replace(tmp, DEST)
    return True


if __name__ == "__main__":
    sys.exit(0 if build() else 1)
