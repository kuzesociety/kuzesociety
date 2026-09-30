//+------------------------------------------------------------------+
//| KzEngine.mqh - streaming strategy engine (pure logic, no MT5 API).|
//|                                                                  |
//| Feed it CLOSED chart bars in chronological order with OnBar().    |
//| It builds signal bars, tracks session context and anchor windows, |
//| runs the sleeves, simulates every signal as a "shadow trade" with  |
//| bid/ask-aware fills, keeps rolling evidence statistics per sleeve  |
//| and anchor, and exposes new signals to the caller.                |
//|                                                                  |
//| Order of events inside OnBar(b):                                  |
//|   1. lazy close of a signal bar left open by a data gap           |
//|   2. shadow entries for signals whose entry bar is b              |
//|   3. update all open shadow positions with b                      |
//|   4. accumulate b; if b ends a signal bar, close it, update the    |
//|      session context, extend anchor windows and run the sleeves   |
//+------------------------------------------------------------------+
#ifndef KZ_ENGINE_MQH
#define KZ_ENGINE_MQH

#include "KzTypes.mqh"
#include "KzUtil.mqh"
#include "KzTime.mqh"
#include "KzSleeves.mqh"

struct KzAnchorState
{
   int     active;
   KzWin   win;
   KzCtx   ctx;
   int     done[KZ_MAX_SLEEVES];
   double  boxHist[KZ_BOXHIST];
   int     boxCnt, boxHead;
   int     boxRecorded;
};

//--- one bar step of a simulated / tracked position. Returns 1 if the position closed on this bar.
//    Port of the research simulator; `isEntryBar` = b is the bar whose open is the entry.
int KzStepPos(KzShadowPos &p, const KzBar &b, const bool isEntryBar, const double slip,
              const KZ_LONG tFlat, int &reason, double &exitPx)
{
   reason = KZ_X_NONE; exitPx = 0.0;
   if(!isEntryBar && b.t >= p.tEnd)
   {
      exitPx = (p.dir > 0) ? b.o : b.o + b.sp;
      reason = (p.tEnd == tFlat) ? KZ_X_FLAT : KZ_X_TIME;
      return 1;
   }
   if(p.noProgOn != 0 && !isEntryBar && p.tNoProg > 0 && b.t >= p.tNoProg)
   {
      if(p.best < p.noProgR * p.rPlan)
      {
         exitPx = (p.dir > 0) ? b.o : b.o + b.sp;
         reason = KZ_X_NOPROG;
         return 1;
      }
      p.tNoProg = -1;
   }
   if(p.dir > 0)
   {
      if(!isEntryBar && b.o <= p.sl) { exitPx = b.o - slip; reason = KZ_X_SL; return 1; }
      if(!isEntryBar && b.o >= p.tp) { exitPx = b.o;        reason = KZ_X_TP; return 1; }
      if(b.l <= p.sl) { exitPx = p.sl - slip; reason = KZ_X_SL; return 1; }
      if(b.h >= p.tp) { exitPx = p.tp;        reason = KZ_X_TP; return 1; }
      if(b.h - p.entry > p.best) p.best = b.h - p.entry;
   }
   else
   {
      double aoK = b.o + b.sp, ahK = b.h + b.sp, alK = b.l + b.sp;
      if(!isEntryBar && aoK >= p.sl) { exitPx = aoK + slip; reason = KZ_X_SL; return 1; }
      if(!isEntryBar && aoK <= p.tp) { exitPx = aoK;        reason = KZ_X_TP; return 1; }
      if(ahK >= p.sl) { exitPx = p.sl + slip; reason = KZ_X_SL; return 1; }
      if(alK <= p.tp) { exitPx = p.tp;        reason = KZ_X_TP; return 1; }
      if(p.entry - alK > p.best) p.best = p.entry - alK;
   }
   return 0;
}

class CKzEngine
{
public:
   KzConfig      m_cfg;

private:
   // signal-bar aggregator
   int           m_haveAgg;
   KZ_LONG       m_aggKey;
   KzBar         m_agg;          // partial signal bar (t = aligned open time)
   KZ_LONG       m_lastChartT;
   // session context
   int           m_haveDay;
   KZ_LONG       m_curDay;
   double        m_dayH, m_dayL;
   double        m_rngHist[KZ_DAYHIST];
   int           m_rngCnt;
   double        m_pdh, m_pdl, m_dref;
   // anchors
   KzAnchorState m_as[KZ_MAX_ANCHORS];
   // pending signals / shadow / closed / outgoing queues
   KzSignal      m_pend[KZ_MAX_PENDING];
   int           m_nPend;
   KzShadowPos   m_pos[KZ_MAX_SHADOW];
   KzClosed      m_closed[KZ_MAX_CLOSED];
   int           m_clHead, m_clTail;
   KzSignal      m_out[KZ_MAX_PENDING];
   int           m_outHead, m_outTail;
   // statistics
   KzCell        m_cell[KZ_MAX_SLEEVES][KZ_MAX_ANCHORS];
   KzCell        m_sleeveCell[KZ_MAX_SLEEVES];
   // last chart bar (for flush)
   KzBar         m_lastBar;
   int           m_haveLast;

public:
   long          m_nSignals, m_nShadowOpened, m_nShadowClosed, m_nDroppedLate, m_nDroppedCost, m_nDroppedFlat, m_nDroppedCtx;

   CKzEngine() { }

   void Init(const KzConfig &cfg)
   {
      m_cfg = cfg;
      m_haveAgg = 0; m_aggKey = 0; m_lastChartT = 0;
      m_haveDay = 0; m_curDay = 0; m_dayH = 0.0; m_dayL = 0.0; m_rngCnt = 0;
      m_pdh = 0.0; m_pdl = 0.0; m_dref = 0.0;
      for(int i = 0; i < KZ_DAYHIST; i++) m_rngHist[i] = 0.0;
      for(int a = 0; a < KZ_MAX_ANCHORS; a++)
      {
         m_as[a].active = 0; m_as[a].win.n = 0;
         m_as[a].boxCnt = 0; m_as[a].boxHead = 0; m_as[a].boxRecorded = 0;
         for(int s = 0; s < KZ_MAX_SLEEVES; s++) m_as[a].done[s] = 0;
         for(int i = 0; i < KZ_BOXHIST; i++) m_as[a].boxHist[i] = 0.0;
         m_as[a].ctx.pdh = 0.0; m_as[a].ctx.pdl = 0.0; m_as[a].ctx.dref = 0.0; m_as[a].ctx.boxBase = 0.0;
      }
      m_nPend = 0;
      for(int i = 0; i < KZ_MAX_SHADOW; i++) m_pos[i].used = 0;
      m_clHead = 0; m_clTail = 0; m_outHead = 0; m_outTail = 0;
      for(int s = 0; s < KZ_MAX_SLEEVES; s++)
      {
         KzCellReset(m_sleeveCell[s]);
         for(int a = 0; a < KZ_MAX_ANCHORS; a++) KzCellReset(m_cell[s][a]);
      }
      m_haveLast = 0;
      m_nSignals = 0; m_nShadowOpened = 0; m_nShadowClosed = 0; m_nDroppedLate = 0; m_nDroppedCost = 0; m_nDroppedFlat = 0; m_nDroppedCtx = 0;
   }

   //--------------------------------------------------------------
   // evidence gate
   //--------------------------------------------------------------
   void CellRead(const int sleeve, const int anchor, int &n, double &mean, double &t, double &wr)
   {
      double se = 0.0;
      if(m_cfg.gateLevelCell != 0 && anchor >= 0) KzCellStats(m_cell[sleeve][anchor], mean, se, t, wr);
      else                                          KzCellStats(m_sleeveCell[sleeve], mean, se, t, wr);
      n = (m_cfg.gateLevelCell != 0 && anchor >= 0) ? m_cell[sleeve][anchor].cnt : m_sleeveCell[sleeve].cnt;
   }

   bool Gate(const int sleeve, const int anchor)
   {
      int n; double mean, t, wr;
      CellRead(sleeve, anchor, n, mean, t, wr);
      if(n < m_cfg.gateMinN) return false;
      double mp = ((double)n * mean + m_cfg.gatePriorK * m_cfg.gatePriorMu) / ((double)n + m_cfg.gatePriorK);
      return (mp >= m_cfg.gateTheta && t >= m_cfg.gateZ);
   }

   //--------------------------------------------------------------
   // queues
   //--------------------------------------------------------------
   int PopSignal(KzSignal &s)
   {
      if(m_outHead == m_outTail) return 0;
      s = m_out[m_outHead];
      m_outHead = (m_outHead + 1) % KZ_MAX_PENDING;
      return 1;
   }

   int PopClosed(KzClosed &c)
   {
      if(m_clHead == m_clTail) return 0;
      c = m_closed[m_clHead];
      m_clHead = (m_clHead + 1) % KZ_MAX_CLOSED;
      return 1;
   }

   int OpenShadowCount()
   {
      int k = 0;
      for(int i = 0; i < KZ_MAX_SHADOW; i++) if(m_pos[i].used != 0) k++;
      return k;
   }

   //--------------------------------------------------------------
   // main entry: one CLOSED chart bar
   //--------------------------------------------------------------
   void OnBar(const KzBar &b)
   {
      KZ_LONG sigSec = (KZ_LONG)m_cfg.sigMin * 60;
      KZ_LONG key = b.t / sigSec;

      // 1. lazy close (gap fallback)
      if(m_haveAgg != 0 && key != m_aggKey) CloseSignalBar();

      // 2. shadow entries
      ProcessPending(b);

      // 3. update open shadow positions
      UpdateShadows(b);

      // 4. aggregate
      if(m_haveAgg == 0)
      {
         m_agg.t = key * sigSec; m_agg.o = b.o; m_agg.h = b.h; m_agg.l = b.l; m_agg.c = b.c; m_agg.v = b.v; m_agg.sp = b.sp;
         m_aggKey = key; m_haveAgg = 1;
      }
      else
      {
         if(b.h > m_agg.h) m_agg.h = b.h;
         if(b.l < m_agg.l) m_agg.l = b.l;
         m_agg.c = b.c; m_agg.v += b.v;
      }
      m_lastChartT = b.t;
      m_lastBar = b; m_haveLast = 1;
      if(((b.t + (KZ_LONG)m_cfg.chartMin * 60) % sigSec) == 0) CloseSignalBar();
   }

   //--------------------------------------------------------------
   // end of data: close whatever is still open at the last close (research runs)
   //--------------------------------------------------------------
   void Flush()
   {
      if(m_haveLast == 0) return;
      for(int i = 0; i < KZ_MAX_SHADOW; i++)
      {
         if(m_pos[i].used == 0) continue;
         double px = (m_pos[i].dir > 0) ? m_lastBar.c : m_lastBar.c + m_lastBar.sp;
         FinishPos(i, KZ_X_DATAEND, px, m_lastBar.t);
      }
   }

private:
   //--------------------------------------------------------------
   void PushClosed(const KzClosed &c)
   {
      m_closed[m_clTail] = c;
      m_clTail = (m_clTail + 1) % KZ_MAX_CLOSED;
      if(m_clTail == m_clHead) m_clHead = (m_clHead + 1) % KZ_MAX_CLOSED;   // overwrite oldest
   }

   void FinishPos(const int idx, const int reason, const double exitPx, const KZ_LONG tExit)
   {
      KzShadowPos p = m_pos[idx];
      double pnl = (p.dir > 0) ? (exitPx - p.entry) : (p.entry - exitPx);
      double r = (p.risk > 0.0) ? pnl / p.risk : 0.0;
      KzClosed c;
      c.sleeve = p.sleeve; c.anchor = p.anchor; c.dir = p.dir; c.reason = reason; c.wasLive = p.wasLive;
      c.tSig = p.tSig; c.tEntry = p.tEntry; c.tExit = tExit;
      c.entry = p.entry; c.exitPx = exitPx; c.sl = p.sl; c.tp = p.tp; c.risk = p.risk; c.r = r;
      c.spread = p.sp;
      PushClosed(c);
      KzCellPush(m_cell[p.sleeve][p.anchor], r, m_cfg.gateN);
      KzCellPush(m_sleeveCell[p.sleeve], r, m_cfg.gateN);
      m_pos[idx].used = 0;
      m_nShadowClosed++;
   }

   void UpdateShadows(const KzBar &b)
   {
      for(int i = 0; i < KZ_MAX_SHADOW; i++)
      {
         if(m_pos[i].used == 0) continue;
         int reason; double px;
         bool isEntry = (b.t == m_pos[i].tEntry);
         KZ_LONG tFlat = (m_cfg.flatMin >= 0) ? KzNextFlat(m_pos[i].tEntry, m_cfg.flatMin) : (KZ_LONG)4000000000000;
         if(KzStepPos(m_pos[i], b, isEntry, m_cfg.slip, tFlat, reason, px) != 0)
            FinishPos(i, reason, px, b.t);
      }
   }

   void ProcessPending(const KzBar &b)
   {
      int keep = 0;
      for(int i = 0; i < m_nPend; i++)
      {
         if(b.t < m_pend[i].tDue) { m_pend[keep] = m_pend[i]; keep++; continue; }
         KzSignal sg = m_pend[i];
         if(b.t - sg.tDue > (KZ_LONG)m_cfg.execGapSec) { m_nDroppedLate++; continue; }
         // shadow entry at the open of b
         double entry = (sg.dir > 0) ? b.o + b.sp + m_cfg.slip : b.o - m_cfg.slip;
         double R0 = KzAbs(entry - sg.sl);
         if(R0 <= 0.0) continue;
         if(b.sp / R0 > m_cfg.maxCostFrac) { m_nDroppedCost++; continue; }
         int slot = -1;
         for(int k = 0; k < KZ_MAX_SHADOW; k++) if(m_pos[k].used == 0) { slot = k; break; }
         if(slot < 0) continue;
         KzShadowPos p;
         p.used = 1; p.sleeve = sg.sleeve; p.anchor = sg.anchor; p.dir = sg.dir;
         p.tSig = sg.tSigOpen; p.tEntry = b.t;
         KZ_LONG tEnd = b.t + (KZ_LONG)(sg.maxHoldMin * 60.0);
         if(m_cfg.flatMin >= 0)
         {
            KZ_LONG tf = KzNextFlat(b.t, m_cfg.flatMin);
            if(tf < tEnd) tEnd = tf;
         }
         p.tEnd = tEnd;
         p.noProgOn = (sg.noProgMin > 0.0) ? 1 : 0;
         p.tNoProg = (sg.noProgMin > 0.0) ? b.t + (KZ_LONG)(sg.noProgMin * 60.0) : (KZ_LONG)-1;
         p.entry = entry; p.sl = sg.sl; p.tp = sg.tp; p.best = 0.0;
         p.rPlan = KzAbs(sg.ref - sg.sl); p.risk = R0; p.noProgR = sg.noProgR;
         p.wasLive = sg.live; p.sp = b.sp;
         m_pos[slot] = p;
         m_nShadowOpened++;
         // remember the spread for the record (stored when closing via risk); nothing else needed
      }
      m_nPend = keep;
   }

   //--------------------------------------------------------------
   void UpdateSessionContext(const KzBar &sb)
   {
      KZ_LONG day = KzSessionDay(sb.t);
      if(m_haveDay == 0)
      {
         m_haveDay = 1; m_curDay = day; m_dayH = sb.h; m_dayL = sb.l;
         m_pdh = 0.0; m_pdl = 0.0; m_dref = 0.0;
         return;
      }
      if(day != m_curDay)
      {
         // finish the previous session day
         double rng = m_dayH - m_dayL;
         if(m_rngCnt < KZ_DAYHIST) { m_rngHist[m_rngCnt] = rng; m_rngCnt++; }
         else { for(int i = 1; i < KZ_DAYHIST; i++) m_rngHist[i - 1] = m_rngHist[i]; m_rngHist[KZ_DAYHIST - 1] = rng; }
         m_pdh = m_dayH; m_pdl = m_dayL;
         // median of the last (up to) 10 ranges
         int cnt = KzMinI(m_rngCnt, 10);
         double tmp[10];
         for(int i = 0; i < cnt; i++) tmp[i] = m_rngHist[m_rngCnt - cnt + i];
         for(int i = 1; i < cnt; i++)
         {
            double key = tmp[i]; int j = i - 1;
            while(j >= 0 && tmp[j] > key) { tmp[j + 1] = tmp[j]; j--; }
            tmp[j + 1] = key;
         }
         m_dref = (cnt % 2 == 1) ? tmp[cnt / 2] : 0.5 * (tmp[cnt / 2 - 1] + tmp[cnt / 2]);
         m_curDay = day; m_dayH = sb.h; m_dayL = sb.l;
      }
      else
      {
         if(sb.h > m_dayH) m_dayH = sb.h;
         if(sb.l < m_dayL) m_dayL = sb.l;
      }
   }

   void ActivateAnchor(const int a)
   {
      m_as[a].active = 1; m_as[a].win.n = 0; m_as[a].boxRecorded = 0;
      for(int s = 0; s < KZ_MAX_SLEEVES; s++) m_as[a].done[s] = 0;
      m_as[a].ctx.pdh = m_pdh; m_as[a].ctx.pdl = m_pdl; m_as[a].ctx.dref = m_dref;
      m_as[a].ctx.boxBase = 0.0;
      if(m_as[a].boxCnt >= 5)
      {
         int take = KzMinI(m_as[a].boxCnt, KZ_BOXHIST);
         double sum = 0.0;
         for(int i = 0; i < take; i++)
         {
            int idx = m_as[a].boxHead - 1 - i;
            while(idx < 0) idx += KZ_BOXHIST;
            sum += m_as[a].boxHist[idx % KZ_BOXHIST];
         }
         m_as[a].ctx.boxBase = sum / (double)take;
      }
   }

   void CloseSignalBar()
   {
      if(m_haveAgg == 0) return;
      KzBar sb = m_agg;
      m_haveAgg = 0;
      KZ_LONG sigSec = (KZ_LONG)m_cfg.sigMin * 60;

      UpdateSessionContext(sb);

      for(int a = 0; a < m_cfg.nAnchors; a++)
      {
         int clk = m_cfg.anchors[a].clock;
         int lm  = KzLocalMinute(sb.t, clk);
         if(lm == m_cfg.anchors[a].minute && (((m_cfg.anchors[a].wdMask >> KzLocalWeekday(sb.t, clk)) & 1) != 0))
            ActivateAnchor(a);
         if(m_as[a].active == 0) continue;
         int n = m_as[a].win.n;
         bool contiguous = (n == 0) || (sb.t == m_as[a].win.t[n - 1] + sigSec);
         if(!contiguous) { m_as[a].active = 0; continue; }
         if(n >= KZ_MAXW) continue;
         m_as[a].win.t[n] = sb.t; m_as[a].win.o[n] = sb.o; m_as[a].win.h[n] = sb.h;
         m_as[a].win.l[n] = sb.l; m_as[a].win.c[n] = sb.c; m_as[a].win.v[n] = sb.v;
         m_as[a].win.n = n + 1;
         EvaluateAnchor(a);
      }
   }

   void EvaluateAnchor(const int a)
   {
      // S1 box-height history: record once the box has completed (and the window has >= 6 bars, as in research)
      if(m_as[a].boxRecorded == 0)
      {
         int boxb = KzBars(m_cfg.P[KZ_S1_BOXRECLAIM].p[0], m_cfg.sigMin);
         if(boxb >= 1 && m_as[a].win.n >= KzMaxI(m_cfg.minWinBars, boxb))
         {
            double hi = -1e18, lo = 1e18;
            for(int k = 0; k < boxb; k++)
            {
               if(m_as[a].win.h[k] > hi) hi = m_as[a].win.h[k];
               if(m_as[a].win.l[k] < lo) lo = m_as[a].win.l[k];
            }
            m_as[a].boxHist[m_as[a].boxHead] = hi - lo;
            m_as[a].boxHead = (m_as[a].boxHead + 1) % KZ_BOXHIST;
            if(m_as[a].boxCnt < KZ_BOXHIST) m_as[a].boxCnt++;
            m_as[a].boxRecorded = 1;
         }
      }
      if(m_as[a].win.n < m_cfg.minWinBars) return;
      for(int s = 0; s < KZ_MAX_SLEEVES; s++)
      {
         if(((m_cfg.anchors[a].sleeveMask >> s) & 1) == 0) continue;
         if(m_as[a].done[s] != 0) continue;
         KzSigOut o;
         KzRunSleeve(s, m_as[a].win, m_cfg.sigMin, m_cfg.P[s], m_as[a].ctx, o);
         if(o.found == 0)
         {
            // once the scan horizon has been fully covered no new signal is possible: stop re-scanning
            if(m_as[a].win.n >= KzHorizon(s, m_cfg.P[s], m_cfg.sigMin)) m_as[a].done[s] = 1;
            continue;
         }
         m_as[a].done[s] = 1;
         KzSignal sg;
         sg.sleeve = s; sg.anchor = a; sg.dir = o.dir;
         sg.tSigOpen = m_as[a].win.t[o.j];
         sg.tDue = sg.tSigOpen + (KZ_LONG)m_cfg.sigMin * 60;
         if(m_cfg.flatMin >= 0 && m_cfg.minToFlatMin > 0 &&
            KzNextFlat(sg.tDue, m_cfg.flatMin) - sg.tDue < (KZ_LONG)m_cfg.minToFlatMin * 60)
         { m_nDroppedFlat++; continue; }      // too close to the forced flat time to be worth entering
         if(m_cfg.ctxFilter != 0)               // the chat's PDH / PDL "hard filters" (opt-in, see docs/VALIDATION_REPORT.md)
         {
            double px = o.ref, op = m_as[a].win.o[0];
            if((m_cfg.ctxFilter & 1) != 0 && o.dir < 0 && m_as[a].ctx.pdh > 0.0 && px > m_as[a].ctx.pdh && px > op) { m_nDroppedCtx++; continue; }
            if((m_cfg.ctxFilter & 2) != 0 && o.dir > 0 && m_as[a].ctx.pdl > 0.0 && px <= m_as[a].ctx.pdl) { m_nDroppedCtx++; continue; }
         }
         sg.ref = o.ref; sg.sl = o.sl; sg.tp = o.tp;
         sg.maxHoldMin = o.maxHoldMin; sg.noProgMin = o.noProgMin; sg.noProgR = o.noProgR;
         sg.riskRef = KzAbs(o.ref - o.sl);
         sg.eligible = (((m_cfg.anchors[a].liveMask >> s) & 1) != 0) ? 1 : 0;
         sg.live = (sg.eligible != 0 && Gate(s, a)) ? 1 : 0;
         m_nSignals++;
         if(m_nPend < KZ_MAX_PENDING) { m_pend[m_nPend] = sg; m_nPend++; }
         int nextTail = (m_outTail + 1) % KZ_MAX_PENDING;
         if(nextTail != m_outHead) { m_out[m_outTail] = sg; m_outTail = nextTail; }
      }
   }
};

#endif
