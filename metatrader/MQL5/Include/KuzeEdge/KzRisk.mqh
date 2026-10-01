//+------------------------------------------------------------------+
//| KzRisk.mqh - position sizing and account-level guards.            |
//| Pure logic (no MT5 calls) so it is unit-tested in the harness.    |
//|                                                                  |
//| Philosophy: this layer can only REDUCE risk. It never increases   |
//| size after a loss, never averages down, never hedges.             |
//+------------------------------------------------------------------+
#ifndef KZ_RISK_MQH
#define KZ_RISK_MQH

#include "KzTypes.mqh"
#include "KzUtil.mqh"

struct KzRiskCfg
{
   double riskPct;          // % of equity risked per trade (distance entry->SL)
   double maxLots;          // hard cap on lots (0 = broker max only)
   double minLotTol;        // trade the broker min lot only if its risk <= tol x intended risk
   double dailyLossPct;     // stop for the day when equity is this % below the day's opening equity (0 = off)
   double dailyProfitPct;   // lock the day when equity is this % above the day's opening equity (0 = off)
   int    maxTradesPerDay;  // 0 = unlimited
   int    maxConsecLosses;  // stop for the day after this many losses in a row (0 = off)
   double maxDDPct;         // kill switch: stop for good when equity is this % below its high-water mark (0 = off)
   double maxCostFrac;      // skip signals whose spread / stop-distance exceeds this
   double maxSpread;        // absolute spread cap in price units (0 = off)
};

struct KzGuard
{
   KZ_LONG dayId;
   double  dayStartEq;
   double  peakEq;
   int     tradesToday;
   int     consecLosses;
   int     hardStop;         // 1 = daily loss / profit lock reached: block entries AND flatten the open trade
   int     softStop;         // 1 = max trades / consecutive losses reached: block entries only (never flattens)
   int     killed;           // 1 = kill switch tripped (until the user resets): block entries AND flatten
   int     reason;           // last block reason code
};

#define KZ_BLK_NONE     0
#define KZ_BLK_DAYLOSS  1
#define KZ_BLK_DAYPROFIT 2
#define KZ_BLK_MAXTRADES 3
#define KZ_BLK_CONSEC   4
#define KZ_BLK_KILL     5

void KzGuardInit(KzGuard &g, const KZ_LONG dayId, const double equity)
{
   g.dayId = dayId; g.dayStartEq = equity; g.peakEq = equity;
   g.tradesToday = 0; g.consecLosses = 0; g.hardStop = 0; g.softStop = 0; g.killed = 0; g.reason = KZ_BLK_NONE;
}

//--- call on every tick / bar with the current equity and session-day id
void KzGuardUpdate(KzGuard &g, const KzRiskCfg &rc, const KZ_LONG dayId, const double equity)
{
   if(dayId != g.dayId)
   {
      g.dayId = dayId; g.dayStartEq = equity;
      g.tradesToday = 0; g.consecLosses = 0; g.hardStop = 0; g.softStop = 0;
      if(g.killed == 0) g.reason = KZ_BLK_NONE;
   }
   if(equity > g.peakEq) g.peakEq = equity;
   if(rc.maxDDPct > 0.0 && g.peakEq > 0.0 && equity <= g.peakEq * (1.0 - rc.maxDDPct / 100.0))
   {
      g.killed = 1; g.reason = KZ_BLK_KILL;
   }
   if(g.hardStop == 0 && g.dayStartEq > 0.0)
   {
      if(rc.dailyLossPct > 0.0 && equity <= g.dayStartEq * (1.0 - rc.dailyLossPct / 100.0))
      { g.hardStop = 1; g.reason = KZ_BLK_DAYLOSS; }
      else if(rc.dailyProfitPct > 0.0 && equity >= g.dayStartEq * (1.0 + rc.dailyProfitPct / 100.0))
      { g.hardStop = 1; g.reason = KZ_BLK_DAYPROFIT; }
   }
}

//--- register a completed LIVE trade (R multiple) for streak / count rules
void KzGuardOnTradeClosed(KzGuard &g, const KzRiskCfg &rc, const double rMultiple)
{
   if(rMultiple < 0.0) g.consecLosses++; else if(rMultiple > 0.0) g.consecLosses = 0;
   if(rc.maxConsecLosses > 0 && g.consecLosses >= rc.maxConsecLosses && g.softStop == 0)
   { g.softStop = 1; if(g.hardStop == 0) g.reason = KZ_BLK_CONSEC; }
}

void KzGuardOnTradeOpened(KzGuard &g, const KzRiskCfg &rc)
{
   g.tradesToday++;
   if(rc.maxTradesPerDay > 0 && g.tradesToday >= rc.maxTradesPerDay && g.softStop == 0)
   { g.softStop = 1; if(g.hardStop == 0) g.reason = KZ_BLK_MAXTRADES; }
}

//--- 1 if a NEW trade may be opened now
int KzGuardAllows(const KzGuard &g)
{
   if(g.killed != 0) return 0;
   if(g.hardStop != 0) return 0;
   if(g.softStop != 0) return 0;
   return 1;
}

//--- 1 if an OPEN trade must be closed now (only hard stops and the kill switch; a trade cap never flattens)
int KzGuardMustFlatten(const KzGuard &g)
{
   return (g.killed != 0 || g.hardStop != 0) ? 1 : 0;
}

//--- lots for a stop distance `slDist` (price units). Rounds DOWN to the lot step so the realised
//    risk never exceeds riskPct; returns 0 (and a reason) when the trade must be skipped.
//    skip: 0 ok, 1 bad input, 2 min-lot risk too high, 3 no room under caps
double KzCalcLots(const double equity, const KzRiskCfg &rc, const double slDist,
                  const double tickSize, const double tickValueLoss,
                  const double minLot, const double maxLot, const double lotStep, int &skip)
{
   skip = 0;
   if(equity <= 0.0 || rc.riskPct <= 0.0 || slDist <= 0.0 || tickSize <= 0.0 || tickValueLoss <= 0.0 || lotStep <= 0.0 || minLot <= 0.0)
   { skip = 1; return 0.0; }
   double riskMoney = equity * rc.riskPct / 100.0;
   double lossPerLot = (slDist / tickSize) * tickValueLoss;
   if(lossPerLot <= 0.0) { skip = 1; return 0.0; }
   double lots = riskMoney / lossPerLot;
   lots = KzFloor(lots / lotStep + 1e-9) * lotStep;
   double cap = maxLot;
   if(rc.maxLots > 0.0 && rc.maxLots < cap) cap = rc.maxLots;
   if(lots > cap) lots = KzFloor(cap / lotStep + 1e-9) * lotStep;
   if(lots < minLot)
   {
      double minLotRisk = minLot * lossPerLot;
      if(minLotRisk > riskMoney * rc.minLotTol) { skip = 2; return 0.0; }
      if(minLot > cap) { skip = 3; return 0.0; }
      lots = minLot;
   }
   return lots;
}

//--- stop / take-profit validity against the broker's minimum distance (price units).
//    dir=+1 long: sl < bid_or_price - minDist, tp > price + minDist ; dir=-1 mirrored. Returns 1 if valid.
int KzStopsValid(const int dir, const double price, const double sl, const double tp, const double minDist)
{
   if(dir > 0)
   {
      if(sl >= price - minDist) return 0;
      if(tp <= price + minDist) return 0;
   }
   else
   {
      if(sl <= price + minDist) return 0;
      if(tp >= price - minDist) return 0;
   }
   return 1;
}

#endif
