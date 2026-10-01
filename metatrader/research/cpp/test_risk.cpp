// Unit tests for KzRisk.mqh (compiled as C++). Exit code 0 = all pass.
#include <cstdio>
#include <cmath>
#include "../../MQL5/Include/KuzeEdge/KzRisk.mqh"
static int fails = 0;
#define CHECK(c) do{ if(!(c)){ printf("FAIL line %d: %s\n", __LINE__, #c); fails++; } }while(0)
static bool near(double a,double b,double e=1e-9){ return std::fabs(a-b)<=e; }
int main(){
  KzRiskCfg rc{}; rc.riskPct=0.5; rc.maxLots=0; rc.minLotTol=2.0; rc.dailyLossPct=2.0; rc.dailyProfitPct=0; rc.maxTradesPerDay=3; rc.maxConsecLosses=2; rc.maxDDPct=10;
  int sk;
  // EURUSD-like: equity 10k, 0.5% = $50 risk, SL 20 pips = 0.0020, tick 0.00001 value $1/tick/lot -> loss/lot = 200 ticks*1 = $200 -> 0.25 lots
  double l = KzCalcLots(10000, rc, 0.0020, 0.00001, 1.0, 0.01, 100, 0.01, sk);
  CHECK(sk==0); CHECK(near(l,0.25,1e-9));
  // rounding is always DOWN: risk 0.5% of 10k with loss/lot=$130 -> 0.3846 -> 0.38
  l = KzCalcLots(10000, rc, 0.0013, 0.00001, 1.0, 0.01, 100, 0.01, sk);
  CHECK(near(l,0.38,1e-9)); CHECK(l*130.0 <= 50.0+1e-9);
  // NQ-like: tick 0.25 value $0.5 (MNQ) ; SL 150 pts -> 600 ticks * 0.5 = $300 per contract ; risk $50 -> 0.166 -> below min lot 1 ; min-lot risk 300 > 2*50 -> skip
  l = KzCalcLots(10000, rc, 150.0, 0.25, 0.5, 1.0, 100, 1.0, sk);
  CHECK(sk==2); CHECK(l==0.0);
  // with tolerance 6 the min lot is accepted
  rc.minLotTol = 6.0; l = KzCalcLots(10000, rc, 150.0, 0.25, 0.5, 1.0, 100, 1.0, sk); CHECK(sk==0); CHECK(near(l,1.0)); rc.minLotTol = 2.0;
  // cap by maxLots
  rc.maxLots = 0.10; l = KzCalcLots(1000000, rc, 0.0020, 0.00001, 1.0, 0.01, 100, 0.01, sk); CHECK(near(l,0.10)); rc.maxLots = 0;
  // bad input
  l = KzCalcLots(0, rc, 0.002, 0.00001, 1.0, 0.01, 100, 0.01, sk); CHECK(sk==1 && l==0.0);
  l = KzCalcLots(10000, rc, 0.0, 0.00001, 1.0, 0.01, 100, 0.01, sk); CHECK(sk==1 && l==0.0);
  // guards
  KzGuard g; KzGuardInit(g, 100, 10000.0);
  CHECK(KzGuardAllows(g)==1);
  KzGuardUpdate(g, rc, 100, 9850.0); CHECK(KzGuardAllows(g)==1);          // -1.5% < 2%
  KzGuardUpdate(g, rc, 100, 9790.0); CHECK(KzGuardAllows(g)==0 && g.reason==KZ_BLK_DAYLOSS);
  KzGuardUpdate(g, rc, 101, 9790.0); CHECK(KzGuardAllows(g)==1);          // new day resets
  KzGuardOnTradeOpened(g, rc); KzGuardOnTradeOpened(g, rc); CHECK(KzGuardAllows(g)==1); KzGuardOnTradeOpened(g, rc); CHECK(KzGuardAllows(g)==0 && g.reason==KZ_BLK_MAXTRADES);
  KzGuardUpdate(g, rc, 102, 9790.0); CHECK(KzGuardAllows(g)==1 && g.tradesToday==0);
  KzGuardOnTradeClosed(g, rc, -1.0); CHECK(KzGuardAllows(g)==1); KzGuardOnTradeClosed(g, rc, -0.5); CHECK(KzGuardAllows(g)==0 && g.reason==KZ_BLK_CONSEC);
  KzGuardUpdate(g, rc, 103, 9790.0); KzGuardOnTradeClosed(g, rc, -1.0); KzGuardOnTradeClosed(g, rc, 0.8); CHECK(g.consecLosses==0);
  // profit lock
  rc.dailyProfitPct = 1.5; KzGuardInit(g, 200, 10000.0); KzGuardUpdate(g, rc, 200, 10160.0); CHECK(KzGuardAllows(g)==0 && g.reason==KZ_BLK_DAYPROFIT); rc.dailyProfitPct = 0;
  // kill switch: peak 12000, 10% DD = 10800
  KzGuardInit(g, 300, 10000.0); KzGuardUpdate(g, rc, 300, 12000.0); KzGuardUpdate(g, rc, 300, 10900.0); CHECK(g.killed==0);
  KzGuardUpdate(g, rc, 300, 10799.0); CHECK(g.killed==1 && KzGuardAllows(g)==0);
  KzGuardUpdate(g, rc, 301, 12000.0); CHECK(KzGuardAllows(g)==0);         // stays killed across days
  // stops validity
  CHECK(KzStopsValid(1, 100.0, 99.0, 101.5, 0.5)==1);
  CHECK(KzStopsValid(1, 100.0, 99.8, 101.5, 0.5)==0);
  CHECK(KzStopsValid(-1, 100.0, 101.0, 98.5, 0.5)==1);
  CHECK(KzStopsValid(-1, 100.0, 100.2, 98.5, 0.5)==0);
  // rolling cell statistics
  KzCell c; KzCellReset(c);
  for(int i=0;i<10;i++) KzCellPush(c, (i%2==0)?1.0:-1.0, 6);
  double m,se,t,wr; KzCellStats(c,m,se,t,wr);
  CHECK(c.cnt==6);
  // window of last 6 values = i=4..9 -> +1,-1,+1,-1,+1,-1 -> mean 0, wr 0.5
  CHECK(near(m,0.0,1e-12)); CHECK(near(wr,0.5,1e-12));
  // soft stops never flatten; hard stops and the kill switch do
  rc.maxTradesPerDay = 1; rc.dailyLossPct = 2.0; KzGuardInit(g, 400, 10000.0);
  KzGuardOnTradeOpened(g, rc); CHECK(KzGuardAllows(g)==0); CHECK(KzGuardMustFlatten(g)==0);          // cap reached: no new trades, open trade untouched
  KzGuardUpdate(g, rc, 400, 9700.0); CHECK(KzGuardMustFlatten(g)==1 && g.reason==KZ_BLK_DAYLOSS);      // a later daily-loss breach is still recorded
  KzGuardInit(g, 500, 10000.0); rc.maxConsecLosses = 2; KzGuardOnTradeClosed(g, rc, -1.0); KzGuardOnTradeClosed(g, rc, -1.0);
  CHECK(KzGuardAllows(g)==0 && KzGuardMustFlatten(g)==0);
  KzGuardUpdate(g, rc, 501, 9500.0); CHECK(KzGuardAllows(g)==1 && KzGuardMustFlatten(g)==0);           // new day clears soft stop
  printf(fails?"RISK TESTS FAILED (%d)\n":"RISK TESTS PASSED\n", fails);
  return fails?1:0;
}
