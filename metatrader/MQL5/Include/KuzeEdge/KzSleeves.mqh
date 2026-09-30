//+------------------------------------------------------------------+
//| KzSleeves.mqh - the five setups distilled from the chat.          |
//|                                                                  |
//| Every function is CAUSAL and PREFIX-CONSISTENT: it only reads      |
//| bars w[0 .. n-1] (n = bars seen so far in the anchor window) and   |
//| returns the FIRST trigger inside that prefix. Calling it again     |
//| with n+1 bars therefore returns the same trigger if it already     |
//| fired, or a new one whose signal bar is exactly n. The engine      |
//| exploits this to run the same code bar by bar (live) and in bulk   |
//| (research), which is what the parity tests verify.                 |
//|                                                                  |
//| Window index 0 = the anchor bar (the first signal bar at/after the |
//| anchor clock time). All prices are bid prices.                     |
//+------------------------------------------------------------------+
#ifndef KZ_SLEEVES_MQH
#define KZ_SLEEVES_MQH

#include "KzTypes.mqh"
#include "KzUtil.mqh"

void KzSigClear(KzSigOut &o)
{
   o.found = 0; o.j = 0; o.dir = 0; o.sl = 0.0; o.tp = 0.0;
   o.maxHoldMin = 0.0; o.ref = 0.0; o.noProgMin = 0.0; o.noProgR = 0.0;
}

void KzSigSet(KzSigOut &o, const int j, const int dir, const double sl, const double tp,
              const double maxHold, const double ref, const double npMin, const double npR)
{
   o.found = 1; o.j = j; o.dir = dir; o.sl = sl; o.tp = tp;
   o.maxHoldMin = maxHold; o.ref = ref; o.noProgMin = npMin; o.noProgR = npR;
}

//=====================================================================
// S1  BOX RECLAIM  ("1PM" sleeve)
//  Box = first boxMin minutes after the anchor. Price leaves the box on
//  one side (a sweep), then a bar CLOSES back inside: trade back through
//  the box toward the other side. Volume gate: the excursion must have
//  happened on low volume relative to the box (volMax). Chat: SL 1.5 / TP 1.
//  P: 0 boxMin, 1 winMin, 2 slMult, 3 tpMult, 4 volMax(0=off), 5 maxDepth(xU),
//     6 minBoxRel, 7 maxBoxRel, 8 maxHoldMin, 9 needCloseOutside, 10 minDepth(xU)
//=====================================================================
void KzS1(const KzWin &w, const int sm, const KzP &P, const KzCtx &cx, KzSigOut &out)
{
   KzSigClear(out);
   int boxb = KzBars(P.p[0], sm);
   int winb = KzBars(P.p[1], sm);
   int nv   = w.n;
   if(boxb < 1 || nv < boxb + 1) return;

   double BH = -1e18, BL = 1e18, bv = 0.0;
   for(int k = 0; k < boxb; k++)
   {
      if(w.h[k] > BH) BH = w.h[k];
      if(w.l[k] < BL) BL = w.l[k];
      bv += w.v[k];
   }
   double U = BH - BL;
   if(U <= 0.0) return;
   double bvavg = bv / (double)boxb;
   if(cx.boxBase > 0.0)
   {
      double r = U / cx.boxBase;
      if(r < P.p[6] || r > P.p[7]) return;
   }

   bool up = false, dn = false, upClosed = false, dnClosed = false;
   double upx = -1e18, dnx = 1e18, upv = 0.0, dnv = 0.0;
   int upn = 0, dnn = 0;
   int last = KzMinI(boxb + winb, nv);
   for(int j = boxb; j < last; j++)
   {
      if(w.h[j] > BH) { up = true; upx = KzMax(upx, w.h[j]); upv += w.v[j]; upn++; }
      if(w.l[j] < BL) { dn = true; dnx = KzMin(dnx, w.l[j]); dnv += w.v[j]; dnn++; }
      if(w.c[j] > BH) upClosed = true;
      if(w.c[j] < BL) dnClosed = true;
      if(up && dn) return;                                   // both sides swept: chop, stand aside
      bool inside = (w.c[j] <= BH) && (w.c[j] >= BL);
      if(up && inside)                                       // fade the up-break -> SHORT
      {
         if(P.p[9] > 0.0 && !upClosed) continue;
         double depth = upx - BH;
         if(depth < P.p[10] * U) continue;
         if(depth > P.p[5] * U) return;                      // a deep sweep is a breakout, not a fake-out
         if(P.p[4] > 0.0 && (upv / (double)upn) > P.p[4] * bvavg) return;   // volume gate
         double entry = w.c[j];
         double sl = entry + P.p[2] * U;
         if(sl < upx + 0.02 * U) sl = upx + 0.02 * U;
         KzSigSet(out, j, -1, sl, entry - P.p[3] * U, P.p[8], entry, 0.0, 0.0);
         return;
      }
      if(dn && inside)                                       // fade the down-break -> LONG
      {
         if(P.p[9] > 0.0 && !dnClosed) continue;
         double depth = BL - dnx;
         if(depth < P.p[10] * U) continue;
         if(depth > P.p[5] * U) return;
         if(P.p[4] > 0.0 && (dnv / (double)dnn) > P.p[4] * bvavg) return;
         double entry = w.c[j];
         double sl = entry - P.p[2] * U;
         if(sl > dnx - 0.02 * U) sl = dnx - 0.02 * U;
         KzSigSet(out, j, 1, sl, entry + P.p[3] * U, P.p[8], entry, 0.0, 0.0);
         return;
      }
   }
}

//=====================================================================
// S2  OPEN EXHAUSTION  ("10:15 reversal" sleeve)
//  After driveMin minutes, if the last runN bars all closed in one
//  direction from the open and the next bar closes back through the
//  previous bar's extreme AT the session extreme, fade it toward the open.
//  P: 0 driveMin, 1 revWinMin, 2 runN, 3 minDrive(xDref), 4 climaxMult(0=off),
//     5 minRewardR, 6 maxRewardR, 7 slBufFrac, 8 maxHoldMin, 9 needSessExtreme
//=====================================================================
void KzS2(const KzWin &w, const int sm, const KzP &P, const KzCtx &cx, KzSigOut &out)
{
   KzSigClear(out);
   double O = w.o[0];
   double dref = cx.dref;
   int db = KzBars(P.p[0], sm);
   int rb = KzBars(P.p[1], sm);
   int runN = (int)P.p[2];
   if(runN < 1) return;
   int last = KzMinI(db + rb, w.n);
   for(int j = db; j < last; j++)
   {
      if(j - runN - 1 < 0) continue;
      double sh = -1e18, slo = 1e18;
      for(int k = 0; k <= j; k++)
      {
         if(w.h[k] > sh)  sh  = w.h[k];
         if(w.l[k] < slo) slo = w.l[k];
      }
      bool allup = true, alldn = true;
      for(int k = j - runN; k < j; k++)
      {
         if(!(w.c[k] > w.o[k])) allup = false;
         if(!(w.c[k] < w.o[k])) alldn = false;
      }
      bool climaxOk = true;
      if(P.p[4] > 0.0)
      {
         double rv = 0.0;
         for(int k = j - runN; k < j; k++) rv += w.v[k];
         rv /= (double)runN;
         double pv = 0.0; int pc = 0;
         for(int k = 0; k < j - runN; k++) { pv += w.v[k]; pc++; }
         if(pc > 0) climaxOk = (rv >= P.p[4] * (pv / (double)pc));
      }
      if(allup && w.c[j] < w.o[j] && w.c[j] < w.l[j - 1] && climaxOk)
      {
         double E = -1e18;
         for(int k = j - runN; k <= j; k++) if(w.h[k] > E) E = w.h[k];
         if(P.p[9] > 0.0 && E < sh - 1e-12) continue;
         if(dref > 0.0 && (E - O) < P.p[3] * dref) continue;
         double entry = w.c[j];
         double sl = E + P.p[7] * (E - entry);
         double R0 = sl - entry;
         double dist = entry - O;
         if(R0 <= 0.0 || dist < P.p[5] * R0) continue;
         double tp = (dist <= P.p[6] * R0) ? O : entry - P.p[6] * R0;
         KzSigSet(out, j, -1, sl, tp, P.p[8], entry, 0.0, 0.0);
         return;
      }
      if(alldn && w.c[j] > w.o[j] && w.c[j] > w.h[j - 1] && climaxOk)
      {
         double E = 1e18;
         for(int k = j - runN; k <= j; k++) if(w.l[k] < E) E = w.l[k];
         if(P.p[9] > 0.0 && E > slo + 1e-12) continue;
         if(dref > 0.0 && (O - E) < P.p[3] * dref) continue;
         double entry = w.c[j];
         double sl = E - P.p[7] * (entry - E);
         double R0 = entry - sl;
         double dist = O - entry;
         if(R0 <= 0.0 || dist < P.p[5] * R0) continue;
         double tp = (dist <= P.p[6] * R0) ? O : entry + P.p[6] * R0;
         KzSigSet(out, j, 1, sl, tp, P.p[8], entry, 0.0, 0.0);
         return;
      }
   }
}

//=====================================================================
// S3  IB BREAK  ("drive real" sleeve)
//  Initial balance = first ibMin minutes. First bar to CLOSE beyond it,
//  with volume >= volMult x IB average, on the correct side of the open
//  (and VWAP): trade the continuation. No-progress exit after noProgMin.
//  P: 0 ibMin, 1 winMin, 2 volMult, 3 slFrac, 4 rr, 5 noProgMin, 6 noProgR,
//     7 minIBrel(xDref), 8 maxIBrel(xDref), 9 maxHoldMin, 10 needVWAP
//=====================================================================
void KzS3(const KzWin &w, const int sm, const KzP &P, const KzCtx &cx, KzSigOut &out)
{
   KzSigClear(out);
   int ibb  = KzBars(P.p[0], sm);
   int winb = KzBars(P.p[1], sm);
   int nv   = w.n;
   if(ibb < 1 || nv < ibb + 1) return;
   double IBH = -1e18, IBL = 1e18, bv = 0.0;
   for(int k = 0; k < ibb; k++)
   {
      if(w.h[k] > IBH) IBH = w.h[k];
      if(w.l[k] < IBL) IBL = w.l[k];
      bv += w.v[k];
   }
   double IBh = IBH - IBL;
   if(IBh <= 0.0) return;
   double vb = bv / (double)ibb;
   double dref = cx.dref;
   if(dref > 0.0)
   {
      if(IBh < P.p[7] * dref || IBh > P.p[8] * dref) return;
   }
   double O = w.o[0];
   double cpv = 0.0, cv = 0.0;
   for(int k = 0; k < ibb; k++)
   {
      double tpx = (w.h[k] + w.l[k] + w.c[k]) / 3.0;
      cpv += tpx * w.v[k]; cv += w.v[k];
   }
   int last = KzMinI(ibb + winb, nv);
   for(int j = ibb; j < last; j++)
   {
      double tpx = (w.h[j] + w.l[j] + w.c[j]) / 3.0;
      cpv += tpx * w.v[j]; cv += w.v[j];
      double vwap = (cv > 0.0) ? cpv / cv : w.c[j];
      if(w.v[j] < P.p[2] * vb) continue;
      if(w.c[j] > IBH + 0.02 * IBh && w.c[j] > O && (P.p[10] == 0.0 || w.c[j] > vwap) && w.c[j - 1] <= IBH + 0.02 * IBh)
      {
         double entry = w.c[j];
         double sl = IBH - P.p[3] * IBh;
         double R0 = entry - sl;
         if(R0 <= 0.0) continue;
         KzSigSet(out, j, 1, sl, entry + P.p[4] * R0, P.p[9], entry, P.p[5], P.p[6]);
         return;
      }
      if(w.c[j] < IBL - 0.02 * IBh && w.c[j] < O && (P.p[10] == 0.0 || w.c[j] < vwap) && w.c[j - 1] >= IBL - 0.02 * IBh)
      {
         double entry = w.c[j];
         double sl = IBL + P.p[3] * IBh;
         double R0 = sl - entry;
         if(R0 <= 0.0) continue;
         KzSigSet(out, j, -1, sl, entry - P.p[4] * R0, P.p[9], entry, P.p[5], P.p[6]);
         return;
      }
   }
}

//=====================================================================
// S4  OPEN RETEST
//  The day has taken a side of the open (extension >= sepMult x box);
//  price pulls back to within touchTol x extension of the open and a bar
//  closes back on the trend side in the trend colour: join the trend.
//  P: 0 boxMin, 1 winMin, 2 sepMult, 3 touchTol, 4 rr, 5 slBuf(xU0),
//     6 maxHoldMin, 7 minSideBars, 8 maxCrosses
//=====================================================================
void KzS4(const KzWin &w, const int sm, const KzP &P, const KzCtx &cx, KzSigOut &out)
{
   KzSigClear(out);
   int boxb = KzBars(P.p[0], sm);
   int winb = KzBars(P.p[1], sm);
   int nv   = w.n;
   if(boxb < 1 || nv < boxb + 1) return;
   double BH = -1e18, BL = 1e18;
   for(int k = 0; k < boxb; k++)
   {
      if(w.h[k] > BH) BH = w.h[k];
      if(w.l[k] < BL) BL = w.l[k];
   }
   double U0 = BH - BL;
   if(U0 <= 0.0) return;
   double O = w.o[0];
   int last = KzMinI(boxb + winb, nv);
   double extUp = 0.0, extDn = 0.0;
   int crosses = 0, prevSide = 0;
   for(int j = 0; j < last; j++)
   {
      int side = (w.c[j] > O) ? 1 : ((w.c[j] < O) ? -1 : 0);
      if(side != 0 && prevSide != 0 && side != prevSide) crosses++;
      if(side != 0) prevSide = side;
      if(w.h[j] - O > extUp) extUp = w.h[j] - O;
      if(O - w.l[j] > extDn) extDn = O - w.l[j];
      if(j < boxb) continue;
      if((double)crosses > P.p[8]) return;
      if(extUp >= P.p[2] * U0 && extUp > extDn)
      {
         if(w.l[j] <= O + P.p[3] * extUp && w.c[j] > O && w.c[j] > w.o[j])
         {
            int cnt = 0;
            for(int k = boxb; k < j; k++) if(w.c[k] > O) cnt++;
            if((double)cnt >= P.p[7])
            {
               double lo = KzMin(w.l[j], w.l[j - 1]);
               double sl = KzMin(lo, O) - P.p[5] * U0;
               double entry = w.c[j];
               double R0 = entry - sl;
               if(R0 > 0.0)
               {
                  KzSigSet(out, j, 1, sl, entry + P.p[4] * R0, P.p[6], entry, 0.0, 0.0);
                  return;
               }
            }
         }
      }
      if(extDn >= P.p[2] * U0 && extDn > extUp)
      {
         if(w.h[j] >= O - P.p[3] * extDn && w.c[j] < O && w.c[j] < w.o[j])
         {
            int cnt = 0;
            for(int k = boxb; k < j; k++) if(w.c[k] < O) cnt++;
            if((double)cnt >= P.p[7])
            {
               double hi = KzMax(w.h[j], w.h[j - 1]);
               double sl = KzMax(hi, O) + P.p[5] * U0;
               double entry = w.c[j];
               double R0 = sl - entry;
               if(R0 > 0.0)
               {
                  KzSigSet(out, j, -1, sl, entry - P.p[4] * R0, P.p[6], entry, 0.0, 0.0);
                  return;
               }
            }
         }
      }
   }
}

//=====================================================================
// S5  LEVEL SWEEP RECLAIM  (previous-day high / low)
//  A bar takes out PDH (PDL) and a bar within reclaimBars closes back
//  under (over) it in the reversal colour: fade the sweep.
//  P: 0 winMin, 1 reclaimBars, 2 minDepth(xDref), 3 maxDepth(xDref), 4 rr,
//     5 slBufFrac, 6 maxHoldMin, 7 minRisk(xDref)
//=====================================================================
void KzS5(const KzWin &w, const int sm, const KzP &P, const KzCtx &cx, KzSigOut &out)
{
   KzSigClear(out);
   double pdh = cx.pdh, pdl = cx.pdl, dref = cx.dref;
   if(!(pdh > 0.0 && pdl > 0.0 && dref > 0.0)) return;
   int winb = KzBars(P.p[0], sm);
   int last = KzMinI(winb, w.n);
   bool su = false, sd = false;
   int suI = -1, sdI = -1;
   double sux = -1e18, sdx = 1e18;
   for(int j = 0; j < last; j++)
   {
      if(w.h[j] > pdh) { if(!su) { su = true; suI = j; } if(w.h[j] > sux) sux = w.h[j]; }
      if(w.l[j] < pdl) { if(!sd) { sd = true; sdI = j; } if(w.l[j] < sdx) sdx = w.l[j]; }
      if(su && w.c[j] < pdh && (double)(j - suI) < P.p[1] && w.c[j] < w.o[j])
      {
         double depth = sux - pdh;
         if(depth >= P.p[2] * dref && depth <= P.p[3] * dref)
         {
            double entry = w.c[j];
            double sl = sux + P.p[5] * depth;
            double R0 = sl - entry;
            if(R0 >= P.p[7] * dref)
            {
               KzSigSet(out, j, -1, sl, entry - P.p[4] * R0, P.p[6], entry, 0.0, 0.0);
               return;
            }
         }
         su = false; suI = -1; sux = -1e18;
      }
      if(sd && w.c[j] > pdl && (double)(j - sdI) < P.p[1] && w.c[j] > w.o[j])
      {
         double depth = pdl - sdx;
         if(depth >= P.p[2] * dref && depth <= P.p[3] * dref)
         {
            double entry = w.c[j];
            double sl = sdx - P.p[5] * depth;
            double R0 = entry - sl;
            if(R0 >= P.p[7] * dref)
            {
               KzSigSet(out, j, 1, sl, entry + P.p[4] * R0, P.p[6], entry, 0.0, 0.0);
               return;
            }
         }
         sd = false; sdI = -1; sdx = 1e18;
      }
   }
}

//--- dispatcher
void KzRunSleeve(const int sleeve, const KzWin &w, const int sm, const KzP &P, const KzCtx &cx, KzSigOut &out)
{
   switch(sleeve)
   {
      case KZ_S1_BOXRECLAIM:  KzS1(w, sm, P, cx, out); break;
      case KZ_S2_OPENEXHAUST: KzS2(w, sm, P, cx, out); break;
      case KZ_S3_IBBREAK:     KzS3(w, sm, P, cx, out); break;
      case KZ_S4_OPENRETEST:  KzS4(w, sm, P, cx, out); break;
      case KZ_S5_LEVELSWEEP:  KzS5(w, sm, P, cx, out); break;
      default: KzSigClear(out); break;
   }
}


//--- number of window bars after which a sleeve can no longer produce a NEW signal (scan horizon)
int KzHorizon(const int sleeve, const KzP &P, const int sm)
{
   switch(sleeve)
   {
      case KZ_S1_BOXRECLAIM:  return KzBars(P.p[0], sm) + KzBars(P.p[1], sm);
      case KZ_S2_OPENEXHAUST: return KzBars(P.p[0], sm) + KzBars(P.p[1], sm);
      case KZ_S3_IBBREAK:     return KzBars(P.p[0], sm) + KzBars(P.p[1], sm);
      case KZ_S4_OPENRETEST:  return KzBars(P.p[0], sm) + KzBars(P.p[1], sm);
      case KZ_S5_LEVELSWEEP:  return KzBars(P.p[0], sm);
      default:                return 0;
   }
}

//--- parameter defaults = the rules exactly as extracted from the chat (research values)
void KzDefaultParams(KzConfig &cfg)
{
   for(int s = 0; s < KZ_MAX_SLEEVES; s++)
      for(int i = 0; i < KZ_NPARAM; i++) cfg.P[s].p[i] = 0.0;
   // S1 box reclaim
   double s1[11] = {15, 120, 1.5, 1.0, 1.0, 1.0, 0.4, 2.5, 60, 1, 0.05};
   // S2 open exhaustion
   double s2[10] = {45, 60, 3, 0.10, 0.0, 0.8, 3.0, 0.10, 90, 1};
   // S3 IB break
   double s3[11] = {30, 90, 1.2, 0.5, 1.5, 15, 0.3, 0.02, 0.5, 90, 1};
   // S4 open retest
   double s4[9]  = {15, 150, 1.0, 0.10, 1.5, 0.10, 90, 3, 2};
   // S5 level sweep
   double s5[8]  = {120, 3, 0.01, 0.20, 1.5, 0.10, 60, 0.01};
   for(int i = 0; i < 11; i++) cfg.P[KZ_S1_BOXRECLAIM].p[i]  = s1[i];
   for(int i = 0; i < 10; i++) cfg.P[KZ_S2_OPENEXHAUST].p[i] = s2[i];
   for(int i = 0; i < 11; i++) cfg.P[KZ_S3_IBBREAK].p[i]     = s3[i];
   for(int i = 0; i < 9;  i++) cfg.P[KZ_S4_OPENRETEST].p[i]  = s4[i];
   for(int i = 0; i < 8;  i++) cfg.P[KZ_S5_LEVELSWEEP].p[i]  = s5[i];
}

#endif
