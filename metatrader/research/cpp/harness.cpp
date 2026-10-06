// Research harness: runs the EA's own strategy engine (KzEngine.mqh, compiled as C++) over a binary bar file.
//   usage: harness bars.bin config.txt out_prefix
// bars.bin : int32 n, then n records {int64 t; double o,h,l,c,v,sp;}   (t = bar OPEN time, UTC seconds)
// config   : text, see parse_config()
// output   : <out_prefix>_trades.csv, <out_prefix>_signals.csv, <out_prefix>_summary.txt
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>
#include <string>
#include <sstream>
#include <fstream>
#include "../../MQL5/Include/KuzeEdge/KzEngine.mqh"

#pragma pack(push,1)
struct Rec { long long t; double o,h,l,c,v,sp; };
#pragma pack(pop)

static void parse_config(const char* path, KzConfig& cfg)
{
   memset(&cfg, 0, sizeof(cfg));
   cfg.sigMin = 5; cfg.chartMin = 1; cfg.flatMin = 16*60+50; cfg.slip = 0.0; cfg.maxCostFrac = 0.5;
   cfg.execGapSec = 180; cfg.minWinBars = 1; cfg.srvMode = KZ_SRV_NYCLOSE; cfg.srvFixedSec = 0;
   cfg.gateN = 60; cfg.gateMinN = 20; cfg.gateTheta = 0.03; cfg.gateZ = 1.0; cfg.gatePriorK = 20; cfg.gatePriorMu = -0.05; cfg.gateLevelCell = 0;
   KzDefaultParams(cfg);
   std::ifstream f(path);
   std::string line;
   while(std::getline(f, line))
   {
      if(line.empty() || line[0]=='#') continue;
      std::istringstream is(line); std::string key; is >> key;
      if(key=="sig") is >> cfg.sigMin;
      else if(key=="chart") is >> cfg.chartMin;
      else if(key=="flat") is >> cfg.flatMin;
      else if(key=="slip") is >> cfg.slip;
      else if(key=="maxcost") is >> cfg.maxCostFrac;
      else if(key=="execgap") is >> cfg.execGapSec;
      else if(key=="minflat") is >> cfg.minToFlatMin;
      else if(key=="ctx") is >> cfg.ctxFilter;
      else if(key=="minwin") is >> cfg.minWinBars;
      else if(key=="gate") is >> cfg.gateN >> cfg.gateMinN >> cfg.gateTheta >> cfg.gateZ >> cfg.gatePriorK >> cfg.gatePriorMu >> cfg.gateLevelCell;
      else if(key=="anchor")
      {
         KzAnchorDef a; int lm = -1; is >> a.clock >> a.minute >> a.wdMask >> a.sleeveMask >> a.id >> lm; a.liveMask = (lm < 0) ? a.sleeveMask : lm;
         if(cfg.nAnchors < KZ_MAX_ANCHORS) cfg.anchors[cfg.nAnchors++] = a;
      }
      else if(key=="param")
      {
         int s; is >> s; double v; int i = 0;
         while(is >> v && i < KZ_NPARAM) cfg.P[s].p[i++] = v;
      }
   }
}

int main(int argc, char** argv)
{
   if(argc < 4) { fprintf(stderr, "usage: harness bars.bin config.txt out_prefix\n"); return 2; }
   static KzConfig cfg;
   parse_config(argv[2], cfg);
   FILE* fb = fopen(argv[1], "rb");
   if(!fb) { fprintf(stderr, "cannot open %s\n", argv[1]); return 2; }
   int n = 0; if(fread(&n, 4, 1, fb) != 1) return 2;
   std::vector<Rec> bars(n);
   if((int)fread(bars.data(), sizeof(Rec), n, fb) != n) { fprintf(stderr, "short read\n"); return 2; }
   fclose(fb);

   CKzEngine* eng = new CKzEngine();
   eng->Init(cfg);

   std::string pre = argv[3];
   FILE* ft = fopen((pre + "_trades.csv").c_str(), "w");
   FILE* fs = fopen((pre + "_signals.csv").c_str(), "w");
   fprintf(ft, "sleeve,anchor,dir,tSig,tEntry,tExit,entry,exit,sl,tp,risk,r,reason,live,spread\n");
   fprintf(fs, "sleeve,anchor,dir,tSigOpen,tDue,ref,sl,tp,live\n");
   KzClosed c; KzSignal sg;
   auto drain = [&]() {
      while(eng->PopSignal(sg))
         fprintf(fs, "%d,%d,%d,%lld,%lld,%.10g,%.10g,%.10g,%d\n", sg.sleeve, sg.anchor, sg.dir, (long long)sg.tSigOpen, (long long)sg.tDue, sg.ref, sg.sl, sg.tp, sg.live);
      while(eng->PopClosed(c))
         fprintf(ft, "%d,%d,%d,%lld,%lld,%lld,%.10g,%.10g,%.10g,%.10g,%.10g,%.10g,%d,%d,%.10g\n", c.sleeve, c.anchor, c.dir, (long long)c.tSig, (long long)c.tEntry, (long long)c.tExit,
                 c.entry, c.exitPx, c.sl, c.tp, c.risk, c.r, c.reason, c.wasLive, c.spread);
   };
   for(int i = 0; i < n; i++)
   {
      KzBar b; b.t = bars[i].t; b.o = bars[i].o; b.h = bars[i].h; b.l = bars[i].l; b.c = bars[i].c; b.v = bars[i].v; b.sp = bars[i].sp;
      eng->OnBar(b);
      drain();
   }
   eng->Flush(); drain();
   fclose(ft); fclose(fs);
   FILE* fm = fopen((pre + "_summary.txt").c_str(), "w");
   fprintf(fm, "bars %d signals %ld opened %ld closed %ld droppedLate %ld droppedCost %ld droppedFlat %ld droppedCtx %ld\n", n, eng->m_nSignals, eng->m_nShadowOpened, eng->m_nShadowClosed, eng->m_nDroppedLate, eng->m_nDroppedCost, eng->m_nDroppedFlat, eng->m_nDroppedCtx);
   for(int s = 0; s < KZ_MAX_SLEEVES; s++)
   {
      int cnt; double m, t, wr; eng->CellRead(s, -1, cnt, m, t, wr);
      fprintf(fm, "sleeve %d rolling n %d mean %.4f t %.2f wr %.3f gate %d\n", s, cnt, m, t, wr, (int)eng->Gate(s, -1));
   }
   fclose(fm);
   delete eng;
   return 0;
}
