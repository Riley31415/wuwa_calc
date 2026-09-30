# python check.py <crate dir> <A,B,C | roster index> [picks] [--quick]: the TS reference against a Rust crate's
# harness on one team — per-evaluate trace, variant runs, traced lines. picks: "w.e.m.sS.rR[.m][.h],..." (zeros if absent)
import json, os, subprocess, sys
H = os.path.dirname(os.path.abspath(__file__))
args = [a for a in sys.argv[1:] if not a.startswith("--")]
quick = "--quick" in sys.argv
crate, team = os.path.abspath(args[0]), args[1]
n = 3 if not team.isdigit() else None
exe = os.path.join(crate, "target", "quick", "harness.exe")
if not os.path.exists(exe):
    exe = os.path.join(crate, "target", "release", "harness.exe")
outs = [a[6:] for a in sys.argv if a.startswith("--out=")]
out = outs[0] if outs else os.path.join(crate, "check")
os.makedirs(out, exist_ok=True)

def parse(p):
    q = p.split(".")
    num = lambda i: int(q[i].lstrip("sr"))
    return {"weapon": num(0), "echo": num(1), "mainstat": num(2), "sequence": num(3), "refine": num(4), "matrix": "m" in q[5:], "highSubs": "h" in q[5:]}

dotted = args[2] if len(args) > 2 else None
picks_json = json.dumps([parse(p) for p in dotted.split(",")]) if dotted else "-"
members = team if not team.isdigit() else None
def node(script, *rest):
    r = subprocess.run(["node", os.path.join(H, script), *rest], capture_output=True, text=True, encoding="utf8")
    if r.returncode:
        sys.exit(f"{script} failed:\n{r.stderr[-2000:]}")
    return r.stdout
def rust(*rest):
    base = [exe, "--team=" + ("x" if members else "t" + team)]
    if members:
        base.append("--members=" + members)
    else:
        sys.exit("roster index needs --members for the Rust side; name the loadouts instead")
    if dotted:
        base.append("--picks=" + dotted)
    r = subprocess.run(base + list(rest), capture_output=True, text=True, encoding="utf8", cwd=out)
    if r.returncode:
        sys.exit(f"harness failed:\n{r.stderr[-2000:]}")
    return r.stdout

ok = True
ref = os.path.join(out, "ref.json")
node("dump.mjs", ref, team, picks_json)
rust("--trace")
r = subprocess.run([sys.executable, os.path.join(H, "rcmp.py"), ref, os.path.join(out, "trace.txt")], capture_output=True, text=True, encoding="utf8")
print("trace:   ", r.stdout.strip().split("\n")[0] if r.returncode == 0 else r.stdout.strip())
ok &= r.returncode == 0
if not quick:
    v_ts = json.loads(node("vdump.mjs", team, picks_json).strip().split("\n")[-1])
    v_rs = json.loads(rust("--variants").strip().split("\n")[-1])
    same = v_ts == v_rs
    print("variants:", "equal" if same else f"DIFFER\n ts {json.dumps(v_ts)[:1500]}\n rs {json.dumps(v_rs)[:1500]}")
    ok &= same
    tref = os.path.join(out, "traced_ts.json")
    node("tdump.mjs", tref, team, picks_json)
    trs = os.path.join(out, "traced_rs.json")
    rust("--traced-json=" + trs)
    r = subprocess.run([sys.executable, os.path.join(H, "tcmp.py"), tref, trs], capture_output=True, text=True, encoding="utf8")
    lines = r.stdout.strip()
    print("traced:  ", lines if len(lines) < 3000 else lines[:3000] + " ...")
    ok &= "-> equal" in lines
sys.exit(0 if ok else 1)
