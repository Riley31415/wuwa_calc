# python verify_all.py <crate dir> [--quick] [--jobs=N] [--only=A,B]: check.py over every roster team whose
# loadouts the crate has, under three builds per team (lowest, highest, and a middle one with matrix)
import json, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
H = os.path.dirname(os.path.abspath(__file__))
args = [a for a in sys.argv[1:] if not a.startswith("--")]
opt = dict(a[2:].split("=", 1) if "=" in a else (a[2:], "1") for a in sys.argv[1:] if a.startswith("--"))
crate = os.path.abspath(args[0])
exe = os.path.join(crate, "target", "quick", "harness.exe")
listed = subprocess.run([exe, "--list"], capture_output=True, text=True, encoding="utf8").stdout.split("\n")
have, pending, dims = set(listed[0].split(",")), [p for p in listed[1].split(",") if p], json.loads(listed[2])
roster = json.loads(subprocess.run(["node", os.path.join(H, "roster.mjs")], capture_output=True, text=True, encoding="utf8").stdout)
only = set(opt["only"].split(",")) if "only" in opt else None
teams = [(i, ms) for i, ms in roster if all(m in have for m in ms) and (only is None or only & set(ms))]

def builds(ms):
    lo, hi, mid = [], [], []
    for m in ms:
        w, e, s, q = dims[m]
        lo.append(f"0.0.0.s{q}.r0")
        hi.append(f"{w - 1}.{e - 1}.{s - 1}.s6.r4.h")
        mid.append(f"{1 % w}.{1 % e}.{1 % s}.s{max(q, 3)}.r2.m")
    return [",".join(lo), ",".join(hi), ",".join(mid)]

def one(job):
    i, ms, picks = job
    # each job its own check dir, so parallel runs don't share files
    sub = os.path.join(crate, "check", f"t{i}_{abs(hash(picks)) % 10**8}")
    os.makedirs(sub, exist_ok=True)
    cmd = [sys.executable, os.path.join(H, "check.py"), crate, ",".join(ms), picks, "--out=" + sub]
    if "quick" in opt:
        cmd.append("--quick")
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf8")
    return i, ms, picks, r.returncode == 0, (r.stdout + r.stderr).strip()

jobs = [(i, ms, p) for i, ms in teams for p in builds(ms)]
print(f"{len(teams)} of {len(roster)} teams, {len(jobs)} builds; pending gear: {', '.join(pending) or 'none'}", flush=True)
bad = 0
with ThreadPoolExecutor(int(opt.get("jobs", 8))) as ex:
    for i, ms, picks, ok, out in ex.map(one, jobs):
        if not ok:
            bad += 1
            print(f"FAIL t{i} {','.join(ms)} {picks}\n  " + out.replace("\n", "\n  ")[:2500], flush=True)
print(f"{len(jobs) - bad} / {len(jobs)} exact")
sys.exit(1 if bad else 0)
