#!/bin/bash
# Build every C++ tool of the research kit into $1 (default ./build):
#   harness    - runs the EA strategy engine (KzEngine.mqh compiled as C++) over a binary bar file
#   test_time  - time/DST library vs Python  (used by tests/run_all.sh)
#   test_risk  - unit tests of sizing and account guards
#   mock_run   - dry-run of the whole EA (transpiled) against a mock MT5 API + bar-driven broker
#   test_class - symbol classification / anchor-string parsing (KzBroker.mqh, transpiled)
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$HERE/../.."; OUT="${1:-$HERE/build}"; mkdir -p "$OUT"
CXX="${CXX:-g++}"; FLAGS="-std=c++17 -O2 -Wall -Wextra -Wno-unused-function -Wno-unused-parameter"
for t in harness test_time test_risk; do "$CXX" $FLAGS -o "$OUT/$t" "$HERE/$t.cpp"; done
python3 "$HERE/transpile.py" "$ROOT" "$OUT/ea_build" >/dev/null
"$CXX" $FLAGS -Wno-unused-variable -DKE_TRANSPILED="\"$OUT/ea_build/KuzeEdge_t.cpp\"" -I "$OUT/ea_build/inc" -I "$ROOT/MQL5/Include" -o "$OUT/mock_run" "$HERE/mock_main.cpp"
"$CXX" $FLAGS -Wno-unused-variable -I "$OUT/ea_build/inc" -I "$ROOT/MQL5/Include" -o "$OUT/test_class" "$HERE/test_class.cpp"
echo "built: $(ls "$OUT" | tr '\n' ' ')"
