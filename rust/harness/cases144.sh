#!/bin/sh
# t144 under several builds: TS reference trace vs the Rust one, row by row
cd "$(dirname "$0")"
run() {
  node dump.mjs ref_case.json 144 "$1" > /dev/null
  (cd .. && ./target/release/harness.exe --trace --picks="$2" > /dev/null)
  printf '%s  ' "$2"; python rcmp.py ref_case.json ../trace.txt | tail -1
}
P='{"weapon":0,"echo":0,"mainstat":0,"sequence":SEQ,"refine":REF,"matrix":MAT,"highSubs":HS}'
Q='{"weapon":0,"echo":2,"mainstat":MS,"sequence":SEQ,"refine":REF,"matrix":false,"highSubs":HS}'
L='{"weapon":0,"echo":1,"mainstat":LMS,"sequence":SEQ,"refine":REF,"matrix":MAT,"highSubs":HS}'
for c in "0 0 false false 0 0" "6 4 false false 3 4" "3 2 false true 7 6" "0 0 true false 5 2" "2 1 true true 1 3" "6 0 false false 13 7"; do
  set -- $c
  j=$(printf '[%s,%s,%s]' "$P" "$Q" "$L" | sed "s/SEQ/$1/g; s/REF/$2/g; s/MAT/$3/g; s/HS/$4/g; s/LMS/$6/; s/MS/$5/")
  m=""; [ "$3" = true ] && m=".m"; h=""; [ "$4" = true ] && h=".h"
  run "$j" "0.0.0.s$1.r$2$h,0.2.$5.s$1.r$2$h,0.1.$6.s$1.r$2$m$h"
done
