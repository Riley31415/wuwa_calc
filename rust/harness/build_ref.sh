#!/bin/sh
# compile the frozen TS reference (ts_ref/, the tree as it stood before the port) into rref/, with
# a trace hook in evaluate/closePress
H=$(cd "$(dirname "$0")" && pwd)
cd "$H" && rm -rf rref && node ../../node_modules/typescript/bin/tsc -p tsconfig.ref.json 2>&1 | grep -v WARN | head
echo '{"type":"module"}' > rref/package.json
python patch_ref.py rref/src/engine/evaluate.js
