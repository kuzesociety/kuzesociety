// mock_main.cpp - dry-run the transpiled EA on historical bars with a bar-driven mock broker.
//   usage: mock_run bars.bin config.txt out_dir
// bars.bin: int32 n; n x {int64 t_utc; double o,h,l,c,v,sp}   (same format as the strategy harness)
#include "mql5_shim.h"
#include <fstream>
#include <sstream>
#include <functional>
MockEnv g_env; int g_shimVerbose = 0; std::string g_shimComment;
#include KE_TRANSPILED
#include "../../MQL5/Include/KuzeEdge/KzTime.mqh"

#pragma pack(push,1)
struct Rec { long long t; double o,h,l,c,v,sp; };
#pragma pack(pop)

static void open_gap_checks() {
   const MqlRates& b = g_env.bars[g_env.cur];
   for(int i = (int)g_env.pos.size() - 1; i >= 0; i--) {
      MockPos& p = g_env.pos[i];
      if(p.dir > 0) {
         if(p.sl > 0 && b.open <= p.sl) { MockOps::closePos(i, b.open, b.time); continue; }
         if(p.tp > 0 && b.open >= p.tp) { MockOps::closePos(i, b.open, b.time); continue; }
      } else {
         double ao = b.open + b.spread * g_env.sym.point;
         if(p.sl > 0 && ao >= p.sl) { MockOps::closePos(i, ao, b.time); continue; }
         if(p.tp > 0 && ao <= p.tp) { MockOps::closePos(i, ao, b.time); continue; }
      }
   }
}
static void range_checks() {
   const MqlRates& b = g_env.bars[g_env.cur]; double sp = b.spread * g_env.sym.point;
   for(int i = (int)g_env.pos.size() - 1; i >= 0; i--) {
      MockPos& p = g_env.pos[i];
      if(p.dir > 0) {
         if(p.sl > 0 && b.low <= p.sl) { MockOps::closePos(i, p.sl, b.time); continue; }
         if(p.tp > 0 && b.high >= p.tp) { MockOps::closePos(i, p.tp, b.time); continue; }
      } else {
         if(p.sl > 0 && b.high + sp >= p.sl) { MockOps::closePos(i, p.sl, b.time); continue; }
         if(p.tp > 0 && b.low + sp <= p.tp) { MockOps::closePos(i, p.tp, b.time); continue; }
      }
   }
}

int main(int argc, char** argv) {
   if(argc < 4) { fprintf(stderr, "usage: mock_run bars.bin config.txt out_dir\n"); return 2; }
   std::string outDir = argv[3];
   if(system(("mkdir -p '" + outDir + "'").c_str())) {}
   g_env.filesDir = outDir + "/files";
   // ---- config
   std::map<std::string, double> kv; std::map<std::string, std::string> ks;
   { std::ifstream f(argv[2]); std::string line; while(std::getline(f, line)) { if(line.empty() || line[0] == '#') continue;
       size_t e = line.find('='); if(e == std::string::npos) continue; std::string k = line.substr(0, e), v = line.substr(e + 1);
       ks[k] = v; kv[k] = atof(v.c_str()); } }
   auto get = [&](const char* k, double d) { return kv.count(k) ? kv[k] : d; };
   g_env.symbol = ks.count("symbol") ? ks["symbol"] : "NAS100";
   int pmin = (int)get("period", 1); g_env.period = (ENUM_TIMEFRAMES)pmin;
   g_env.sym.point = get("point", 0.01); g_env.sym.digits = (int)get("digits", 2);
   g_env.sym.tickSize = get("ticksize", 0.01); g_env.sym.tickValue = get("tickvalue", 0.01);
   g_env.sym.minLot = get("minlot", 0.01); g_env.sym.maxLot = get("maxlot", 100); g_env.sym.lotStep = get("lotstep", 0.01);
   g_env.sym.contract = get("contract", 1.0); g_env.sym.stopsLevel = (int)get("stops", 0); g_env.sym.freezeLevel = (int)get("freeze", 0);
   g_env.balance = get("balance", 10000.0); g_env.leverage = get("leverage", 100.0);
   g_shimVerbose = (int)get("verbose", 0);
   // ---- bars (UTC -> New-York-close server clock)
   FILE* fb = fopen(argv[1], "rb"); if(!fb) { fprintf(stderr, "cannot open bars\n"); return 2; }
   int n = 0; if(fread(&n, 4, 1, fb) != 1) return 2; std::vector<Rec> rec(n); if((int)fread(rec.data(), sizeof(Rec), n, fb) != n) return 2; fclose(fb);
   g_env.bars.resize(n);
   for(int i = 0; i < n; i++) { MqlRates& b = g_env.bars[i]; b.time = KzUtcToServer(rec[i].t, KZ_SRV_NYCLOSE, 0);
      b.open = rec[i].o; b.high = rec[i].h; b.low = rec[i].l; b.close = rec[i].c; b.tick_volume = (long long)rec[i].v;
      b.spread = (int)std::llround(rec[i].sp / g_env.sym.point); b.real_volume = 0; }
   // ---- EA inputs
   #define SETD(name, key) if(kv.count(key)) name = kv[key];
   #define SETI(name, key, T) if(kv.count(key)) name = (T)(int)kv[key];
   SETI(InpMode, "mode", ENUM_KZ_MODE) SETI(InpClass, "class", ENUM_KZ_CLASS) SETI(InpSignalMin, "sigmin", int)
   SETD(InpRiskPct, "risk") SETD(InpS1VolMax, "s1vol") SETD(InpMaxCostFrac, "maxcost") SETI(InpBootstrapDays, "bootdays", int)
   SETI(InpGateMinN, "gateminn", int) SETD(InpGateTheta, "gatetheta") SETD(InpGateZ, "gatez") SETI(InpExtraLiveMask, "extralive", int)
   SETD(InpDailyLossPct, "dailyloss") SETI(InpMaxTradesPerDay, "maxtrades", int) SETD(InpMaxDDPct, "maxdd") SETI(InpMaxConsecLosses, "maxconsec", int)
   SETI(InpFlatHHMM, "flat", int) SETI(InpMinToFlatMin, "minflat", int) SETI(InpCtxFilter, "ctx", int) SETD(InpMinLotTol, "minlottol") SETI(InpLedger, "ledger", bool) SETI(InpLedgerBoot, "ledgerboot", bool)
   SETI(InpGateCell, "gatecell", int) SETD(InpMaxLots, "maxlots")
   InpVerbose = g_shimVerbose != 0; InpPanel = false;
   int start = (int)get("start", 20000); if(start >= n) start = n / 2;
   g_env.cur = start; g_env.timeCurrent = g_env.bars[start].time;
   g_env.bid = g_env.bars[start].open; g_env.ask = g_env.bid + g_env.bars[start].spread * g_env.sym.point;
   int rc = OnInit();
   if(rc != INIT_SUCCEEDED) { fprintf(stderr, "OnInit failed: %d\n", rc); return 3; }
   double peakEq = g_env.balance, maxDD = 0.0;
   for(int i = start + 1; i < n; i++) {
      g_env.cur = i; const MqlRates& b = g_env.bars[i];
      double sp = b.spread * g_env.sym.point;
      g_env.timeCurrent = b.time; g_env.bid = b.open; g_env.ask = b.open + sp;
      open_gap_checks();
      OnTick();
      range_checks();
      g_env.timeCurrent = b.time + 30; g_env.bid = b.close; g_env.ask = b.close + sp;
      OnTick();
      double eq = AccountInfoDouble(ACCOUNT_EQUITY); if(eq > peakEq) peakEq = eq; double dd = (peakEq - eq) / peakEq; if(dd > maxDD) maxDD = dd;
   }
   // close whatever is open at the last close
   for(int i = (int)g_env.pos.size() - 1; i >= 0; i--) MockOps::closePos(i, g_env.pos[i].dir > 0 ? g_env.bars[n-1].close : g_env.bars[n-1].close + g_env.bars[n-1].spread * g_env.sym.point, g_env.bars[n-1].time);
   OnDeinit(0);
   { std::ofstream f(outDir + "/live_trades.csv"); f << "tOpenSrv,tCloseSrv,dir,open,close,lots,profit,sl,tp\n"; for(auto& s : g_env.closedLog) f << s << "\n"; }
   double pnl = g_env.balance - get("balance", 10000.0);
   printf("bars %d start %d | live trades %zu | balance %.2f (pnl %.2f) | maxDD %.2f%% | EA live opened %ld closed %ld sumR %.2f | signals seen %ld\n",
          n, start, g_env.closedLog.size(), g_env.balance, pnl, maxDD * 100.0, g_liveOpened, g_liveClosed, g_liveR, g_sigSeen);
   return 0;
}
