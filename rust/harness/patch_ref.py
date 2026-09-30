# trace hook: one line per evaluate and per closePress, read by dump.mjs through globalThis.__tr
import sys
p = sys.argv[1]
s = open(p, encoding="utf8").read()
s = s.replace("    return snapshot ?? result;",
  "    globalThis.__tr?.push(['E', action.name, half, slot.name, frameStart, result.avg, result.mv, slot.energy, slot.concerto, ...slot.forte, state.offtune, result.variantAvg]);\n    return snapshot ?? result;", 1)
i = s.index("function closePress")
j = s.index("runPhase(5, false);", i)
s = s[:j] + "runPhase(5, false); globalThis.__tr?.push(['C', action.name, slot.name, state.frame]);" + s[j + len("runPhase(5, false);"):]
assert s.count("__tr") == 2
open(p, "w", encoding="utf8", newline="\n").write(s)
