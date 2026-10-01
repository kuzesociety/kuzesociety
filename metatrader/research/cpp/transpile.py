#!/usr/bin/env python3
"""Turn the MQL5-only files (KuzeEdge.mq5, KzBroker.mqh) into C++ that compiles against mql5_shim.h.
Only mechanical rewrites; no logic is touched.
usage: transpile.py <metatrader dir> <build dir>
"""
import re, sys, os
root, out = sys.argv[1], sys.argv[2]
inc_out = os.path.join(out, 'inc', 'KuzeEdge'); os.makedirs(inc_out, exist_ok=True)

def common(src):
    src = re.sub(r'^\s*#property[^\n]*\n', '', src, flags=re.M)                 # #property ...
    src = re.sub(r'^\s*input\s+group\s+"[^"]*"\s*\n', '', src, flags=re.M)        # input group "..."
    src = re.sub(r'^\s*input\s+', '', src, flags=re.M)                            # input <type> name = v;
    src = re.sub(r'#include\s*<Trade[\\/]Trade\.mqh>\s*\n', '', src)              # CTrade comes from the shim
    src = re.sub(r'#include\s*"(Kz\w+\.mqh)"', r'#include <KuzeEdge/\1>', src)    # relative -> angle include
    # dynamic arrays:  T name[];   ->   MqlArr<T> name;
    src = re.sub(r'\b(MqlRates|string|double|int|long|ulong)\s+(\w+)\s*\[\s*\]\s*;', r'MqlArr<\1> \2;', src)
    return src

for name, src_path, dst in (('KzBroker.mqh', os.path.join(root, 'MQL5/Include/KuzeEdge/KzBroker.mqh'), os.path.join(inc_out, 'KzBroker.mqh')),
                            ('KuzeEdge.mq5', os.path.join(root, 'MQL5/Experts/KuzeEdge/KuzeEdge.mq5'), os.path.join(out, 'KuzeEdge_t.cpp'))):
    s = open(src_path).read()
    t = common(s)
    open(dst, 'w').write(t)
    print('transpiled', name, '->', dst)

# lint: input variables are read-only in MQL5 -> the EA must never assign to Inp*
ea = open(os.path.join(root, 'MQL5/Experts/KuzeEdge/KuzeEdge.mq5')).read()
bad = re.findall(r'\bInp\w+\s*(?:=|\+=|-=|\*=|/=|\+\+|--)(?!=)', re.sub(r'input\s+[^;]*;', '', ea))
if bad:
    print('LINT FAIL: assignments to input variables:', bad); sys.exit(1)
print('lint ok: no assignments to Inp* inputs')
