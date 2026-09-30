# python rcmp.py <ref.json> <rust trace.txt>: the first row where the Rust trace leaves the TS one
import json, sys
ref = json.load(open(sys.argv[1]))["trace"]
rs = [l for l in open(sys.argv[2], encoding="utf8").read().split("\n") if l]
def norm_ref(t):
    if t[0] == "E":
        return ["E", t[1], "null" if t[2] is None else t[2], t[3]] + [float(x) for x in t[4:15]]
    return ["C", t[1], t[2], float(t[3])]
def norm_rs(l):
    p = l.split("|")
    if p[0] == "E":
        return ["E", p[1], p[2], p[3]] + [float(x) for x in p[4:15]]
    return ["C", p[1], p[2], float(p[3])]
n = min(len(ref), len(rs))
for i in range(n):
    a, b = norm_ref(ref[i]), norm_rs(rs[i])
    if a != b:
        print("first mismatch at", i)
        for k in range(max(0, i - 4), min(n, i + 3)):
            print(" ref", norm_ref(ref[k]))
            print(" rs ", norm_rs(rs[k]))
        sys.exit(1)
if len(ref) != len(rs):
    print("equal for", n, "rows but lengths differ:", len(ref), len(rs))
    sys.exit(1)
print("all", n, "rows equal")
