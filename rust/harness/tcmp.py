# python tcmp.py <ts traced.json> <rust reply.json>: lines and snapshots of a traced run, field by field
import json, sys
ts = json.load(open(sys.argv[1]))
rs = json.load(open(sys.argv[2]))
if "error" in rs:
    sys.exit(rs["error"])
tr = rs["traced"]
acts = {a["id"]: a for a in tr["actions"]}
ids, order = {}, []
def sid(r):
    if r not in ids:
        ids[r] = len(ids)
        order.append(r)
    return ids[r]
rlines = [[dict(id=l["id"], isChain=l["isChain"], mv=l["mv"], avg=l["avg"], spill=l["spill"], aggregate=l["aggregate"], fieldKey=l["fieldKey"] is not None,
                snap=sid(l["snap"]), members=[sid(m) for m in l["members"]], parts=[sid(p) for p in l["parts"]]) for l in sec] for sec in tr["lines"]]
tlines = [[dict(l, fieldKey=l["fieldKey"] is not None) for l in sec] for sec in ts["lines"]]
bad = 0
for k, (a, b) in enumerate(zip(tlines, rlines)):
    if len(a) != len(b):
        print("section", k, "line count", len(a), len(b)); bad += 1
    for i, (x, y) in enumerate(zip(a, b)):
        if x != y:
            print("section", k, "line", i, "\n ts", x, "\n rs", y); bad += 1; break
fields = ["member", "slot", "triggered", "mv", "avg", "starts", "ends", "hitAt", "swapFrames", "queued", "source"]
tfields = ["type", "stats", "forte", "forteBefore", "maxForte", "energy", "concerto", "offtune", "energyBefore", "concertoBefore", "offtuneBefore",
           "concertoShort", "forteShort", "energyWiped", "realEnergyBefore", "frame", "frames", "tag", "active", "timestopBanked",
           "heldLocal", "heldGlobal", "heldEnemy", "opensFields", "castGain", "entries", "castAdds"]
for n, (t, r) in enumerate(zip(ts["snaps"], [tr["rows"][i] for i in order])):
    rr = dict(r)
    rr["action"] = acts[r["action"]]["name"]
    rr["source"] = [r["source"]["name"], r["source"]["source"]] if r["source"] else None
    t2 = r.get("trace") or {}
    conv = {
        "heldLocal": [[h["name"], h["source"], h["left"]] for h in t2.get("heldLocal", [])],
        "heldGlobal": [[h["name"], h["source"], h["left"]] for h in t2.get("heldGlobal", [])],
        "heldEnemy": [[h["name"], h["source"], h["left"]] for h in t2.get("heldEnemy", [])],
        "entries": [[e[0], e[1], e[2], e[3]] for e in t2.get("entries", [])],
        "castAdds": [[c["source"], c["owner"], c["gains"]] for c in t2.get("castAdds", [])],
    }
    diffs = []
    if t["action"] != rr["action"]:
        diffs.append(("action", t["action"], rr["action"]))
    for f in fields:
        if t[f] != rr[f]:
            diffs.append((f, t[f], rr[f]))
    for f in tfields:
        v = conv.get(f, t2.get(f))
        if t[f] != v:
            diffs.append((f, str(t[f])[:300], str(v)[:300]))
    if diffs:
        print("snap", n, t["action"], "@", t["frame"])
        for d in diffs:
            print("  ", d)
        bad += 1
        if bad > 6:
            break
print("lines", sum(len(s) for s in tlines), "snaps", len(ts["snaps"]), "/", len(order), "->", "equal" if bad == 0 else f"{bad} differ")
