//+------------------------------------------------------------------+
//| KzUtil.mqh - tiny math helpers usable from both MQL5 and C++.     |
//+------------------------------------------------------------------+
#ifndef KZ_UTIL_MQH
#define KZ_UTIL_MQH

#include "KzTypes.mqh"

double KzAbs(const double x)                 { return (x < 0.0) ? -x : x; }
double KzMax(const double a, const double b) { return (a > b) ? a : b; }
double KzMin(const double a, const double b) { return (a < b) ? a : b; }
int    KzMaxI(const int a, const int b)      { return (a > b) ? a : b; }
int    KzMinI(const int a, const int b)      { return (a < b) ? a : b; }

double KzSqrt(const double x)
{
#ifdef __MQL5__
   return MathSqrt(x);
#else
   return std::sqrt(x);
#endif
}

double KzFloor(const double x)
{
#ifdef __MQL5__
   return MathFloor(x);
#else
   return std::floor(x);
#endif
}

//--- floor(P / sm) as int, identical to Python int(P // sm) for positive values
int KzBars(const double minutes, const int sm)
{
   return (int)KzFloor(minutes / (double)sm);
}

//--- zero a KzCell
void KzCellReset(KzCell &c)
{
   c.head = 0; c.cnt = 0; c.sum = 0.0; c.sumsq = 0.0;
   for(int i = 0; i < KZ_STAT_RING; i++) c.r[i] = 0.0;
}

//--- push an R multiple into a rolling cell (keeps at most `cap` values, cap <= KZ_STAT_RING)
void KzCellPush(KzCell &c, const double r, const int cap)
{
   int capN = KzMinI(cap, KZ_STAT_RING);
   if(capN < 1) capN = 1;
   if(c.cnt >= capN)
   {
      // overwrite the oldest of the last capN values: oldest index = (head - cnt) mod RING ; we keep window = capN
      int oldest = c.head - c.cnt;
      while(oldest < 0) oldest += KZ_STAT_RING;
      double old = c.r[oldest % KZ_STAT_RING];
      c.sum -= old; c.sumsq -= old * old; c.cnt--;
   }
   c.r[c.head] = r;
   c.head = (c.head + 1) % KZ_STAT_RING;
   c.sum += r; c.sumsq += r * r; c.cnt++;
}

//--- mean, standard error and t-stat of the cell content
void KzCellStats(const KzCell &c, double &mean, double &se, double &tstat, double &winRate)
{
   mean = 0.0; se = 0.0; tstat = 0.0; winRate = 0.0;
   if(c.cnt < 1) return;
   mean = c.sum / (double)c.cnt;
   int wins = 0;
   int start = c.head - c.cnt; while(start < 0) start += KZ_STAT_RING;
   for(int i = 0; i < c.cnt; i++) if(c.r[(start + i) % KZ_STAT_RING] > 0.0) wins++;
   winRate = (double)wins / (double)c.cnt;
   if(c.cnt < 2) return;
   double var = (c.sumsq - (double)c.cnt * mean * mean) / (double)(c.cnt - 1);
   if(var < 1e-12) var = 1e-12;
   se = KzSqrt(var / (double)c.cnt);
   tstat = (se > 0.0) ? mean / se : 0.0;
}

#endif
