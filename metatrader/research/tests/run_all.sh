#!/usr/bin/env bash
# Full self-test of the research kit. Needs: g++ (C++17), python3 with numpy, pandas, numba. No market data, no MetaTrader.
#   ./tests/run_all.sh [build dir]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; RES="$HERE/.."
export KZ_BUILD="${1:-$RES/cpp/build}"
export KZ_OUT="${KZ_OUT:-$RES/out}"
mkdir -p "$KZ_OUT"
step() { echo; echo "=== $* ==="; }
step "build (engine harness, time test, risk test, EA mock run)"
bash "$RES/cpp/build.sh" "$KZ_BUILD"
step "unit tests: sizing and account guards (KzRisk.mqh)";               "$KZ_BUILD/test_risk"
step "unit tests: symbol classification + anchor parsing";              "$KZ_BUILD/test_class"
step "time library vs independent Python implementation";                 python3 "$HERE/check_time.py"
step "parameter defaults agree across MQL5 / prototype / scripts";        python3 "$HERE/check_defaults.py"
step "engine vs numba prototype on synthetic data (trade-for-trade)";     python3 "$HERE/check_parity_synth.py"
step "whole EA on a mock broker: live path == shadow simulator, guards";  python3 "$HERE/check_mock_ea.py"
step "export CSV -> evaluation script (synthetic file)";                  python3 "$HERE/check_export_pipeline.py"
step "preset files only use real EA inputs";                              python3 "$HERE/check_presets.py"
echo; echo "ALL TESTS PASSED"
