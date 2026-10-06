//+------------------------------------------------------------------+
//| KuzeEdge.mq5                                                      |
//| Time-anchored, level- and volume-aware intraday engine for M1/M5. |
//|                                                                  |
//| WHAT IT IS                                                        |
//|  Five setups distilled from a private trading chat (box reclaim,   |
//|  open exhaustion, IB break, open retest, PDH/PDL sweep) running on |
//|  session anchors that adapt to the market class and to the broker |
//|  clock. Every setup is ALWAYS simulated as a "shadow trade" with   |
//|  bid/ask-aware fills so each account builds its own evidence.     |
//|                                                                  |
//| WHAT IT IS NOT                                                    |
//|  It does not promise profit. In our tests only S1 (box reclaim,    |
//|  volume-gated) on US index anchors showed a positive net edge, on  |
//|  a small sample. Only that cell is live-eligible by default, and   |
//|  even then only while its rolling shadow statistics pass the gate. |
//|  Read docs/VALIDATION_REPORT.md before risking money.             |
//+------------------------------------------------------------------+
#property copyright "kuzesociety"
#property link      "https://github.com/kuzesociety/kuzesociety"
#property version   "1.00"
#property description "KuzeEdge - evidence-gated intraday engine (M1/M5). Shadow-measures every setup; trades only what its own statistics support."

#include <KuzeEdge/KzEngine.mqh>
#include <KuzeEdge/KzRisk.mqh>
#include <KuzeEdge/KzPresets.mqh>
#include <KuzeEdge/KzBroker.mqh>

//--- input enums ------------------------------------------------------------------
enum ENUM_KZ_MODE
{
   KZ_MODE_OFF    = 0,   // Off (nothing runs)
   KZ_MODE_SHADOW = 1,   // Shadow only (measure every setup, never trade)
   KZ_MODE_GATED  = 2,   // Trade only live-eligible cells that pass the evidence gate
   KZ_MODE_FORCE  = 3    // Trade live-eligible cells even if the evidence gate fails
};

enum ENUM_KZ_CLASS
{
   KZ_C_AUTO     = 0,    // Auto-detect from the symbol name
   KZ_C_US_INDEX = 1,    // US index (US100/NAS100/NQ, US500, US30)
   KZ_C_EU_INDEX = 2,    // European index (DE40, UK100, ...)
   KZ_C_FX       = 3,    // Forex
   KZ_C_METAL    = 4,    // Metals (gold, silver)
   KZ_C_ENERGY   = 5,    // Energy (oil, gas)
   KZ_C_CRYPTO   = 6,    // Crypto
   KZ_C_CUSTOM   = 7     // Custom anchors (see InpCustomAnchors)
};

enum ENUM_KZ_SRV
{
   KZ_S_AUTO    = 0,     // Auto (New-York-close server, the common broker convention)
   KZ_S_NYCLOSE = 1,     // Server = New York + 7h (GMT+2 winter / GMT+3 summer, US DST)
   KZ_S_EUDST   = 2,     // Server = UTC+2 winter / UTC+3 summer (EU DST)
   KZ_S_FIXED   = 3      // Fixed offset from UTC (InpServerFixedHours), no DST
};

//--- inputs -------------------------------------------------------------------------
input group "=== General ==="
input ENUM_KZ_MODE  InpMode            = KZ_MODE_SHADOW;  // Mode (SHADOW = measure only; GATED/FORCE place orders)
input int           InpMagic           = 240929;          // Magic number
input ENUM_KZ_CLASS InpClass           = KZ_C_AUTO;       // Market class
input int           InpSignalMin       = 5;               // Signal bar in minutes (1, 5 or 15)
input ENUM_KZ_SRV   InpServerMode      = KZ_S_AUTO;       // Broker server time convention
input int           InpServerFixedHours= 0;               // Fixed UTC offset in hours (FIXED mode only)
input string        InpCustomAnchors   = "NY0930,NY1300"; // Custom anchors: NY|LON|FRA|TYO|UTC + HHMM, comma separated
input int           InpExtraLiveMask   = 0;               // OPT-IN extra live sleeves on every anchor (S1=1,S2=2,S3=4,S4=8,S5=16). Unproven: see report

input group "=== S1 Box reclaim (evidence: NQ futures only, volume-gated) ==="
input int           InpS1BoxMin        = 15;              // Box length (minutes after the anchor)
input int           InpS1WinMin        = 120;             // Window to trade after the box (minutes)
input double        InpS1SlMult        = 1.5;             // Stop = this x box height
input double        InpS1TpMult        = 1.0;             // Target = this x box height
input double        InpS1VolMax        = 0.7;             // Max excursion volume vs box volume (0 = gate off)
input int           InpS1MaxHoldMin    = 60;              // Time stop (minutes)

input group "=== Risk ==="
input double        InpRiskPct         = 0.5;             // Risk per trade (% of equity)
input double        InpMaxLots         = 0.0;             // Max lots (0 = broker max)
input double        InpMinLotTol       = 2.0;             // Allow the broker min lot if its risk <= this x intended
input double        InpMaxCostFrac     = 0.10;            // Skip if spread / stop distance exceeds this
input double        InpMaxSpreadPts    = 0.0;             // Skip if spread > this many points (0 = off)
input double        InpDailyLossPct    = 2.0;             // Stop for the day at -x% equity (0 = off)
input double        InpDailyProfitPct  = 0.0;             // Lock the day at +x% equity (0 = off)
input int           InpMaxTradesPerDay = 3;               // Max trades per session day (0 = off)
input int           InpMaxConsecLosses = 2;               // Stop for the day after N losses in a row (0 = off)
input double        InpMaxDDPct        = 10.0;            // Kill switch: stop for good at -x% from the equity peak (0 = off)
input int           InpDeviationPts    = 20;              // Max slippage (points)
input int           InpFlatHHMM        = 1650;            // Flatten at this New-York time (0 = off)
input int           InpMinToFlatMin    = 10;              // Skip entries due less than N minutes before the flat time (0 = off)
input int           InpCtxFilter       = 0;               // Chat "hard filters" (bitmask): 1 = no shorts above PDH and the open, 2 = no longs at/below PDL (0 = off; evidence: none)
input bool          InpFlatOnStop      = true;            // Close the open trade when a daily stop / kill switch trips

input group "=== Evidence gate (shadow statistics) ==="
input int           InpGateN           = 60;              // Rolling window (shadow trades)
input int           InpGateMinN        = 20;              // Minimum shadow trades before a sleeve may go live
input double        InpGateTheta       = 0.03;            // Minimum shrunk mean R
input double        InpGateZ           = 1.0;             // Minimum t-statistic
input int           InpGateCell        = 0;               // 0 = per sleeve, 1 = per sleeve x anchor
input int           InpBootstrapDays   = 250;             // History (days) replayed at start to build the evidence
input double        InpShadowSlipPts   = 0.0;             // Slippage per side assumed by the shadow simulator (points)

input group "=== Logging ==="
input bool          InpLedger          = true;            // Write the shadow-trade ledger (CSV, common Files folder)
input bool          InpLedgerBoot      = false;           // Also write the bootstrap (history) trades to the ledger
input bool          InpPanel           = true;            // Show the status panel on the chart
input bool          InpVerbose         = false;           // Verbose log

//--- globals ------------------------------------------------------------------------
CKzEngine   g_eng;
KzConfig    g_cfg;
KzRiskCfg   g_rc;
KzGuard     g_guard;
KzSymInfo   g_sym;
KzLive      g_live;
CTrade      g_trade;

int         g_chartMin   = 1;
int         g_srvMode    = KZ_SRV_NYCLOSE;
int         g_srvFixed   = 0;
int         g_cls        = KZ_CLASS_FX;
datetime    g_lastFedOpen= 0;     // server open time of the last bar fed to the engine
datetime    g_curBarOpen = 0;     // server open time of the currently forming bar
KzBar       g_lastBar;
int         g_haveLastBar= 0;
long        g_sigSeen    = 0;
long        g_liveOpened = 0;
long        g_liveClosed = 0;
double      g_liveR      = 0.0;
string      g_ledgerFile = "";
string      g_lastEvent  = "";
string      g_ledgerHeader = "symbol;sleeve;anchor;dir;t_signal_utc;t_entry_utc;t_exit_utc;entry;exit;sl;tp;R;exit_reason;was_live";

//--- helpers --------------------------------------------------------------------------
KZ_LONG ToUtc(const datetime serverTime)
{
   return KzServerToUtc((KZ_LONG)serverTime, g_srvMode, g_srvFixed);
}

string AnchorName(const int a)
{
   if(a < 0 || a >= g_cfg.nAnchors) return "?";
   int m = g_cfg.anchors[a].minute;
   return KzClockName(g_cfg.anchors[a].clock) + StringFormat("%02d%02d", m / 60, m % 60);
}

void Ev(const string msg)
{
   g_lastEvent = msg;
   Print("KuzeEdge: ", msg);
}

void Dbg(const string msg)
{
   if(InpVerbose) Print("KuzeEdge[v]: ", msg);
}

//--- convert one MqlRates bar into the engine's bar (UTC, price-unit spread) -----------
void ToKzBar(const MqlRates &r, KzBar &b)
{
   b.t  = ToUtc(r.time);
   b.o  = r.open; b.h = r.high; b.l = r.low; b.c = r.close;
   b.v  = (double)r.tick_volume;
   double sp = (double)r.spread * g_sym.point;
   if(sp <= 0.0) sp = (double)SymbolInfoInteger(_Symbol, SYMBOL_SPREAD) * g_sym.point;
   b.sp = sp;
}

void LedgerRow(const KzClosed &c)
{
   if(!InpLedger) return;
   string line = StringFormat("%s;%s;%s;%d;%s;%s;%s;%.6f;%.6f;%.6f;%.6f;%.3f;%s;%d",
                              _Symbol, KzSleeveName(c.sleeve), AnchorName(c.anchor), c.dir,
                              KzIso(c.tSig), KzIso(c.tEntry), KzIso(c.tExit),
                              c.entry, c.exitPx, c.sl, c.tp, c.r, KzExitName(c.reason), c.wasLive);
   KzLedgerAdd(line);
}

void DrainClosed(const bool writeLedger)
{
   KzClosed c;
   while(g_eng.PopClosed(c) != 0)
   {
      if(writeLedger) LedgerRow(c);
      Dbg(StringFormat("shadow closed %s %s dir=%d R=%.2f %s", KzSleeveName(c.sleeve), AnchorName(c.anchor), c.dir, c.r, KzExitName(c.reason)));
   }
   if(writeLedger && StringLen(g_kzLedgerBuf) > 6000) KzLedgerFlush(g_ledgerFile, g_ledgerHeader);
}

//--- feed one closed bar to the engine ------------------------------------------------------
void FeedBar(const MqlRates &r)
{
   KzBar b;
   ToKzBar(r, b);
   g_eng.OnBar(b);
   g_lastBar = b; g_haveLastBar = 1;
   g_lastFedOpen = r.time;
}

int FeedNewClosedBars()
{
   int psec = PeriodSeconds(_Period);
   int need = 1;
   if(g_lastFedOpen > 0) need = (int)((g_curBarOpen - g_lastFedOpen) / psec);
   if(need < 1) need = 1;
   if(need > 3000) need = 3000;
   MqlRates r[];
   ArraySetAsSeries(r, false);
   int got = CopyRates(_Symbol, _Period, 1, need, r);
   int fed = 0;
   for(int i = 0; i < got; i++)
   {
      if(r[i].time <= g_lastFedOpen) continue;
      FeedBar(r[i]);
      fed++;
   }
   DrainClosed(true);
   return fed;
}

//--- evidence bootstrap: replay history so the gate has statistics from day one ---------------
int Bootstrap()
{
   int perDay = 1440 / g_chartMin;
   int want = InpBootstrapDays * perDay;
   int avail = Bars(_Symbol, _Period) - 3;
   int n = (want < avail) ? want : avail;
   if(n < 10) return 0;
   MqlRates r[];
   ArraySetAsSeries(r, false);
   int got = CopyRates(_Symbol, _Period, 1, n, r);
   for(int i = 0; i < got; i++)
   {
      FeedBar(r[i]);
      if((i % 20000) == 0) { KzSignal s; while(g_eng.PopSignal(s) != 0) { } DrainClosed(InpLedgerBoot); }
   }
   KzSignal sg;
   while(g_eng.PopSignal(sg) != 0) { }       // history signals are never traded
   DrainClosed(InpLedgerBoot);
   return got;
}

//--- soft sanity check of the broker-clock assumption (log only) -------------------------------
void TimeSanityCheck()
{
   int nb = 20 * (1440 / g_chartMin);
   MqlRates r[];
   ArraySetAsSeries(r, false);
   int got = CopyRates(_Symbol, _Period, 1, nb, r);
   if(got < 200) return;
   double vol[24];
   for(int h = 0; h < 24; h++) vol[h] = 0.0;
   for(int i = 0; i < got; i++)
   {
      KZ_LONG u = ToUtc(r[i].time);
      int h = KzLocalMinute(u, KZ_CLK_NY) / 60;
      vol[h] += (double)r[i].tick_volume;
   }
   int pk = 0;
   for(int h = 1; h < 24; h++) if(vol[h] > vol[pk]) pk = h;
   bool ok = true;
   if(g_cls == KZ_CLASS_US_INDEX) ok = (pk == 9 || pk == 10 || pk == 11);
   else if(g_cls == KZ_CLASS_METAL || g_cls == KZ_CLASS_FX || g_cls == KZ_CLASS_ENERGY) ok = (pk >= 3 && pk <= 4) || (pk >= 8 && pk <= 11);
   if(!ok)
      Ev(StringFormat("WARNING: busiest New-York hour is %02d:00 which is unusual for %s. Check InpServerMode / InpServerFixedHours (anchors depend on the broker clock).", pk, KzClassName(g_cls)));
   else
      Dbg(StringFormat("time sanity ok: busiest New-York hour %02d:00", pk));
}

//--- live position bookkeeping ------------------------------------------------------------------
void ClearLive()
{
   g_live.has = 0; g_live.ticket = 0; g_live.posId = 0; g_live.sleeve = -1; g_live.anchor = -1;
   g_live.lots = 0.0; g_live.riskMoney = 0.0;
   g_live.p.used = 0;
}

void OnLiveClosed()
{
   double res = KzPositionResult(g_live.posId);
   double r = (g_live.riskMoney > 0.0) ? res / g_live.riskMoney : 0.0;
   KzGuardOnTradeClosed(g_guard, g_rc, r);
   g_liveClosed++;
   g_liveR += r;
   Ev(StringFormat("live trade closed: %s %s result %.2f (%.2fR) | live total %I64d trades %.2fR",
                   (g_live.sleeve >= 0 ? KzSleeveName(g_live.sleeve) : "recovered"), AnchorName(g_live.anchor), res, r, g_liveClosed, g_liveR));
   ClearLive();
}

bool CloseLive(const string why)
{
   if(g_live.has == 0) return true;
   if(!g_trade.PositionClose(g_live.ticket))
   {
      Ev(StringFormat("close failed (%s): retcode %u %s", why, g_trade.ResultRetcode(), g_trade.ResultRetcodeDescription()));
      return false;
   }
   Ev("closing live trade: " + why);
   return true;
}

//--- try to open a live trade for a signal --------------------------------------------------------
void TryOpen(const KzSignal &sg, const KZ_LONG nowUtc)
{
   if(g_live.has != 0)                    { Dbg("skip: position already open"); return; }
   if(KzGuardAllows(g_guard) == 0)        { Dbg(StringFormat("skip: guard blocked (reason %d)", g_guard.reason)); return; }
   if(nowUtc - sg.tDue > (KZ_LONG)g_cfg.execGapSec) { Dbg("skip: signal is stale"); return; }
   if(SymbolInfoInteger(_Symbol, SYMBOL_TRADE_MODE) != SYMBOL_TRADE_MODE_FULL) { Dbg("skip: symbol not fully tradable"); return; }
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !MQLInfoInteger(MQL_TRADE_ALLOWED)) { Dbg("skip: trading not allowed in terminal"); return; }

   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   if(bid <= 0.0 || ask <= 0.0 || ask < bid) { Dbg("skip: no valid quote"); return; }
   double spread = ask - bid;
   if(InpMaxSpreadPts > 0.0 && spread > InpMaxSpreadPts * g_sym.point) { Dbg("skip: spread too wide"); return; }

   double entryRef = (sg.dir > 0) ? ask : bid;
   double slDist = KzAbs(entryRef - sg.sl);
   if(slDist <= 0.0) { Dbg("skip: zero stop distance"); return; }
   if(spread / slDist > g_rc.maxCostFrac) { Dbg("skip: cost gate (spread/risk too high)"); return; }

   double minDist = KzMax(g_sym.stopsLevel, g_sym.freezeLevel);
   double refPx = (sg.dir > 0) ? bid : ask;
   if(KzStopsValid(sg.dir, refPx, sg.sl, sg.tp, minDist) == 0) { Dbg("skip: stops too close / price already beyond them"); return; }

   int skip = 0;
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double lots = KzCalcLots(equity, g_rc, slDist, g_sym.tickSize, g_sym.tickValueLoss, g_sym.minLot, g_sym.maxLot, g_sym.lotStep, skip);
   if(lots <= 0.0) { Dbg(StringFormat("skip: sizing refused (code %d)", skip)); return; }

   ENUM_ORDER_TYPE otype = (sg.dir > 0) ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   double margin = 0.0;
   if(OrderCalcMargin(otype, _Symbol, lots, entryRef, margin))
   {
      if(margin > AccountInfoDouble(ACCOUNT_MARGIN_FREE) * 0.9) { Dbg("skip: not enough free margin"); return; }
   }

   double sl = KzNormPrice(sg.sl, g_sym.digits);
   double tp = KzNormPrice(sg.tp, g_sym.digits);
   string cmt = StringFormat("KE %s %s", KzSleeveName(sg.sleeve), AnchorName(sg.anchor));
   bool sent = (sg.dir > 0) ? g_trade.Buy(lots, _Symbol, 0.0, sl, tp, cmt) : g_trade.Sell(lots, _Symbol, 0.0, sl, tp, cmt);
   uint rc = g_trade.ResultRetcode();
   if(!sent || (rc != TRADE_RETCODE_DONE && rc != TRADE_RETCODE_DONE_PARTIAL))
   {
      Ev(StringFormat("order rejected: retcode %u %s", rc, g_trade.ResultRetcodeDescription()));
      return;
   }

   ulong tk; long pid; int dir; double po, psl, ptp, vol; datetime to;
   if(!KzFindPosition(_Symbol, InpMagic, tk, pid, dir, po, psl, ptp, vol, to)) { Ev("order sent but position not found"); return; }
   double lossPerLot = (KzAbs(po - sl) / g_sym.tickSize) * g_sym.tickValueLoss;

   g_live.has = 1; g_live.ticket = tk; g_live.posId = pid;
   g_live.sleeve = sg.sleeve; g_live.anchor = sg.anchor; g_live.lots = vol;
   g_live.riskMoney = vol * lossPerLot;
   KZ_LONG tEntry = ToUtc(g_curBarOpen);
   KzShadowPos p;
   p.used = 1; p.sleeve = sg.sleeve; p.anchor = sg.anchor; p.dir = dir;
   p.tSig = sg.tSigOpen; p.tEntry = tEntry;
   KZ_LONG tEnd = tEntry + (KZ_LONG)(sg.maxHoldMin * 60.0);
   if(g_cfg.flatMin >= 0) { KZ_LONG tf = KzNextFlat(tEntry, g_cfg.flatMin); if(tf < tEnd) tEnd = tf; }
   p.tEnd = tEnd;
   p.noProgOn = (sg.noProgMin > 0.0) ? 1 : 0;
   p.tNoProg = (sg.noProgMin > 0.0) ? tEntry + (KZ_LONG)(sg.noProgMin * 60.0) : (KZ_LONG)-1;
   p.entry = po; p.sl = sl; p.tp = tp; p.best = 0.0;
   p.rPlan = KzAbs(sg.ref - sg.sl); p.risk = KzAbs(po - sl); p.noProgR = sg.noProgR; p.wasLive = 1; p.sp = ask - bid;
   g_live.p = p;
   KzGuardOnTradeOpened(g_guard, g_rc);
   g_liveOpened++;
   Ev(StringFormat("LIVE %s %s %s lots %.2f entry %.5f SL %.5f TP %.5f risk %.2f (%.2f%% eq)", (dir > 0 ? "BUY" : "SELL"),
                   KzSleeveName(sg.sleeve), AnchorName(sg.anchor), vol, po, sl, tp, g_live.riskMoney, InpRiskPct));
}

//--- software exits for the live trade (time stop, flat time, no-progress) ---------------------------
void ManageLive(const KZ_LONG nowUtc)
{
   if(g_live.has == 0) return;
   ulong tk; long pid; int dir; double po, psl, ptp, vol; datetime to;
   if(!KzFindPosition(_Symbol, InpMagic, tk, pid, dir, po, psl, ptp, vol, to)) { OnLiveClosed(); return; }
   if(g_live.p.used == 0) return;
   // favourable excursion from the bars since entry (same rule as the shadow simulator)
   if(g_haveLastBar != 0 && g_lastBar.t >= g_live.p.tEntry)
   {
      double fav = (g_live.p.dir > 0) ? g_lastBar.h - g_live.p.entry : g_live.p.entry - (g_lastBar.l + g_lastBar.sp);
      if(fav > g_live.p.best) g_live.p.best = fav;
   }
   if(nowUtc >= g_live.p.tEnd)
   {
      bool flat = (g_cfg.flatMin >= 0 && g_live.p.tEnd == KzNextFlat(g_live.p.tEntry, g_cfg.flatMin));
      CloseLive(flat ? "flat time" : "time stop");
      return;
   }
   if(g_live.p.noProgOn != 0 && g_live.p.tNoProg > 0 && nowUtc >= g_live.p.tNoProg)
   {
      if(g_live.p.best < g_live.p.noProgR * g_live.p.rPlan) { CloseLive("no-progress exit"); return; }
      g_live.p.tNoProg = -1;
   }
}

void RecoverPosition()
{
   ulong tk; long pid; int dir; double po, psl, ptp, vol; datetime to;
   if(!KzFindPosition(_Symbol, InpMagic, tk, pid, dir, po, psl, ptp, vol, to)) return;
   g_live.has = 1; g_live.ticket = tk; g_live.posId = pid; g_live.sleeve = -1; g_live.anchor = -1; g_live.lots = vol;
   double lossPerLot = (KzAbs(po - psl) / g_sym.tickSize) * g_sym.tickValueLoss;
   g_live.riskMoney = (psl > 0.0) ? vol * lossPerLot : 0.0;
   KZ_LONG tEntry = ToUtc(to);
   KzShadowPos p;
   p.used = 1; p.sleeve = -1; p.anchor = -1; p.dir = dir; p.tSig = tEntry; p.tEntry = tEntry;
   KZ_LONG tEnd = tEntry + 120 * 60;
   if(g_cfg.flatMin >= 0) { KZ_LONG tf = KzNextFlat(tEntry, g_cfg.flatMin); if(tf < tEnd) tEnd = tf; }
   p.tEnd = tEnd; p.noProgOn = 0; p.tNoProg = -1; p.entry = po; p.sl = psl; p.tp = ptp; p.best = 0.0;
   p.rPlan = KzAbs(po - psl); p.risk = p.rPlan; p.noProgR = 0.0; p.wasLive = 1; p.sp = 0.0;
   g_live.p = p;
   Ev(StringFormat("recovered an open position #%I64u (%s %.2f lots): managing it with a 2h time stop", tk, (dir > 0 ? "BUY" : "SELL"), vol));
}

//--- guards ---------------------------------------------------------------------------------------------
void UpdateGuards(const KZ_LONG nowUtc)
{
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   int wasKilled = g_guard.killed, wasHard = g_guard.hardStop;
   KzGuardUpdate(g_guard, g_rc, KzSessionDay(nowUtc), equity);
   if(g_guard.killed != 0 && wasKilled == 0)
   {
      Ev(StringFormat("KILL SWITCH: equity %.2f is %.1f%% below its peak %.2f. Trading stopped until you clear the global variable KZ_KILL_%d_%s.", equity, InpMaxDDPct, g_guard.peakEq, InpMagic, _Symbol));
      GlobalVariableSet(StringFormat("KZ_KILL_%d_%s", InpMagic, _Symbol), 1.0);
   }
   if(g_guard.hardStop != 0 && wasHard == 0)
      Ev(StringFormat("daily stop: reason %d (equity %.2f, day start %.2f)", g_guard.reason, equity, g_guard.dayStartEq));
   if(KzGuardMustFlatten(g_guard) != 0 && InpFlatOnStop && g_live.has != 0)
      CloseLive("guard stop");
}

//--- panel --------------------------------------------------------------------------------------------------
void UpdatePanel()
{
   if(!InpPanel) return;
   string s = "KuzeEdge 1.00   " + _Symbol + "   class " + KzClassName(g_cls) + "   signal " + IntegerToString(InpSignalMin) + "m   mode ";
   switch(InpMode)
   {
      case KZ_MODE_OFF:    s += "OFF"; break;
      case KZ_MODE_SHADOW: s += "SHADOW"; break;
      case KZ_MODE_GATED:  s += "GATED"; break;
      default:             s += "FORCE"; break;
   }
   s += "\n";
   s += StringFormat("Guard: %s | trades today %d | losses in a row %d | day P/L %.2f%%\n",
                     (g_guard.killed != 0 ? "KILLED" : ((g_guard.hardStop != 0 || g_guard.softStop != 0) ? "BLOCKED" : "ok")), g_guard.tradesToday,
                     g_guard.consecLosses, (g_guard.dayStartEq > 0.0 ? (AccountInfoDouble(ACCOUNT_EQUITY) / g_guard.dayStartEq - 1.0) * 100.0 : 0.0));
   for(int k = 0; k < KZ_MAX_SLEEVES; k++)
   {
      int n; double m, t, wr;
      g_eng.CellRead(k, -1, n, m, t, wr);
      s += StringFormat("%-15s shadow n=%3d  meanR %+.2f  t %+.1f  win %2.0f%%  gate %s\n", KzSleeveName(k), n, m, t, wr * 100.0, (g_eng.Gate(k, -1) ? "PASS" : "no"));
   }
   s += StringFormat("Signals seen %I64d | live opened %I64d closed %I64d (%.2fR)\n", g_sigSeen, g_liveOpened, g_liveClosed, g_liveR);
   if(g_live.has != 0) s += StringFormat("OPEN: %s %.2f lots @ %.5f\n", (g_live.p.dir > 0 ? "BUY" : "SELL"), g_live.lots, g_live.p.entry);
   s += "Last: " + g_lastEvent;
   Comment(s);
}

//--- events ---------------------------------------------------------------------------------------------------------
int OnInit()
{
   if(InpMode == KZ_MODE_OFF) { Print("KuzeEdge: mode OFF"); return INIT_SUCCEEDED; }
   g_chartMin = PeriodSeconds(_Period) / 60;
   if(InpSignalMin != 1 && InpSignalMin != 5 && InpSignalMin != 15)
   { Print("KuzeEdge: InpSignalMin must be 1, 5 or 15"); return INIT_PARAMETERS_INCORRECT; }
   if(g_chartMin < 1 || g_chartMin > InpSignalMin || (InpSignalMin % g_chartMin) != 0)
   { Print("KuzeEdge: attach to an M1 or M5 chart whose timeframe divides the signal bar (", InpSignalMin, " min)"); return INIT_PARAMETERS_INCORRECT; }
   if(!SymbolSelect(_Symbol, true) || !KzLoadSymInfo(_Symbol, g_sym))
   { Print("KuzeEdge: symbol information unavailable for ", _Symbol); return INIT_FAILED; }

   g_srvMode  = (InpServerMode == KZ_S_EUDST) ? KZ_SRV_EUDST : ((InpServerMode == KZ_S_FIXED) ? KZ_SRV_FIXED : KZ_SRV_NYCLOSE);
   g_srvFixed = InpServerFixedHours * 3600;
   g_cls = (InpClass == KZ_C_AUTO) ? KzDetectClass(_Symbol) : (int)InpClass;

   ZeroMemory(g_cfg);
   g_cfg.sigMin = InpSignalMin; g_cfg.chartMin = g_chartMin;
   g_cfg.flatMin = (InpFlatHHMM > 0) ? (InpFlatHHMM / 100) * 60 + (InpFlatHHMM % 100) : -1;
   if(g_cfg.flatMin >= 0 && g_chartMin > 1 && (g_cfg.flatMin % g_chartMin) != 0)
   {
      g_cfg.flatMin = (g_cfg.flatMin / g_chartMin) * g_chartMin;   // a coarse chart cannot act between its own bars
      Print("KuzeEdge: flat time aligned down to the chart timeframe: ", g_cfg.flatMin / 60, ":", StringFormat("%02d", g_cfg.flatMin % 60), " New York");
   }
   g_cfg.minToFlatMin = InpMinToFlatMin;
   g_cfg.ctxFilter = InpCtxFilter;
   g_cfg.slip = InpShadowSlipPts * g_sym.point;
   g_cfg.maxCostFrac = InpMaxCostFrac;
   g_cfg.execGapSec = ((g_chartMin * 60 > 180) ? g_chartMin * 60 : 180) + 60;
   g_cfg.minWinBars = 1;
   g_cfg.srvMode = g_srvMode; g_cfg.srvFixedSec = g_srvFixed;
   g_cfg.gateN = InpGateN; g_cfg.gateMinN = InpGateMinN; g_cfg.gateTheta = InpGateTheta; g_cfg.gateZ = InpGateZ;
   g_cfg.gatePriorK = 20.0; g_cfg.gatePriorMu = -0.05; g_cfg.gateLevelCell = InpGateCell;
   KzDefaultParams(g_cfg);
   g_cfg.P[KZ_S1_BOXRECLAIM].p[0] = (double)InpS1BoxMin;
   g_cfg.P[KZ_S1_BOXRECLAIM].p[1] = (double)InpS1WinMin;
   g_cfg.P[KZ_S1_BOXRECLAIM].p[2] = InpS1SlMult;
   g_cfg.P[KZ_S1_BOXRECLAIM].p[3] = InpS1TpMult;
   g_cfg.P[KZ_S1_BOXRECLAIM].p[4] = InpS1VolMax;
   g_cfg.P[KZ_S1_BOXRECLAIM].p[8] = (double)InpS1MaxHoldMin;

   int extra = InpExtraLiveMask & KZ_ALLSLEEVES;
   if(g_cls == KZ_CLASS_CUSTOM) KzParseAnchors(InpCustomAnchors, g_cfg, extra);
   else                         KzBuildPreset(g_cfg, g_cls, extra);
   if(g_cfg.nAnchors < 1) { Print("KuzeEdge: no valid anchors (check InpCustomAnchors)"); return INIT_PARAMETERS_INCORRECT; }
   if(KzBars(g_cfg.P[KZ_S1_BOXRECLAIM].p[0], g_cfg.sigMin) < 1) { Print("KuzeEdge: S1 box must be at least one signal bar"); return INIT_PARAMETERS_INCORRECT; }

   g_rc.riskPct = InpRiskPct; g_rc.maxLots = InpMaxLots; g_rc.minLotTol = InpMinLotTol;
   g_rc.dailyLossPct = InpDailyLossPct; g_rc.dailyProfitPct = InpDailyProfitPct;
   g_rc.maxTradesPerDay = InpMaxTradesPerDay; g_rc.maxConsecLosses = InpMaxConsecLosses;
   g_rc.maxDDPct = InpMaxDDPct; g_rc.maxCostFrac = InpMaxCostFrac; g_rc.maxSpread = InpMaxSpreadPts * g_sym.point;

   g_eng.Init(g_cfg);
   ClearLive();
   g_haveLastBar = 0; g_lastFedOpen = 0;
   g_ledgerFile = StringFormat("KuzeEdge\\%s_M%d_S%d_ledger.csv", _Symbol, g_chartMin, InpSignalMin);

   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetDeviationInPoints(InpDeviationPts);
   g_trade.SetTypeFilling(KzPickFilling(_Symbol));
   g_trade.SetAsyncMode(false);

   int boot = Bootstrap();
   g_curBarOpen = iTime(_Symbol, _Period, 0);
   KZ_LONG nowUtc = ToUtc(TimeCurrent());
   KzGuardInit(g_guard, KzSessionDay(nowUtc), AccountInfoDouble(ACCOUNT_EQUITY));
   string gk = StringFormat("KZ_KILL_%d_%s", InpMagic, _Symbol);
   if(GlobalVariableCheck(gk) && GlobalVariableGet(gk) > 0.5)
   { g_guard.killed = 1; g_guard.reason = KZ_BLK_KILL; Print("KuzeEdge: kill switch is ACTIVE (global variable ", gk, "). Delete it to resume trading."); }
   RecoverPosition();
   TimeSanityCheck();

   Print("KuzeEdge: ledger file: ", TerminalInfoString(TERMINAL_COMMONDATA_PATH), "\\Files\\", g_ledgerFile);
   Print("KuzeEdge: started on ", _Symbol, " M", g_chartMin, " | class ", KzClassName(g_cls), " | anchors ", g_cfg.nAnchors,
         " | bootstrap bars ", boot, " | mode ", (int)InpMode);
   for(int k = 0; k < KZ_MAX_SLEEVES; k++)
   {
      int n; double m, t, wr;
      g_eng.CellRead(k, -1, n, m, t, wr);
      Print("KuzeEdge: evidence ", KzSleeveName(k), ": n=", n, " meanR=", DoubleToString(m, 3), " t=", DoubleToString(t, 2),
            " win=", DoubleToString(wr * 100.0, 1), "% gate=", (g_eng.Gate(k, -1) ? "PASS" : "no"));
   }
   UpdatePanel();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   KzLedgerFlush(g_ledgerFile, g_ledgerHeader);
   Comment("");
}

void HandleNewBar()
{
   FeedNewClosedBars();
   KZ_LONG nowUtc = ToUtc(TimeCurrent());
   UpdateGuards(nowUtc);
   ManageLive(nowUtc);
   KzSignal sg;
   while(g_eng.PopSignal(sg) != 0)
   {
      g_sigSeen++;
      Dbg(StringFormat("signal %s %s dir %d ref %.5f sl %.5f tp %.5f eligible %d gate %d", KzSleeveName(sg.sleeve), AnchorName(sg.anchor), sg.dir, sg.ref, sg.sl, sg.tp, sg.eligible, sg.live));
      if(InpMode == KZ_MODE_SHADOW) continue;
      bool ok = (InpMode == KZ_MODE_FORCE) ? (sg.eligible != 0) : (sg.live != 0);
      if(!ok) continue;
      TryOpen(sg, nowUtc);
   }
   UpdatePanel();
}

void OnTick()
{
   if(InpMode == KZ_MODE_OFF) return;
   datetime cur = iTime(_Symbol, _Period, 0);
   if(cur == 0) return;
   if(cur != g_curBarOpen)
   {
      g_curBarOpen = cur;
      HandleNewBar();
      return;
   }
   // intrabar: only the cheap protective checks
   KZ_LONG nowUtc = ToUtc(TimeCurrent());
   UpdateGuards(nowUtc);
   if(g_live.has != 0 && g_live.p.used != 0 && nowUtc >= g_live.p.tEnd) ManageLive(nowUtc);
}

double OnTester()
{
   double trades = TesterStatistics(STAT_TRADES);
   if(trades < 30.0) return 0.0;
   double rf = TesterStatistics(STAT_RECOVERY_FACTOR);
   return rf * MathSqrt(trades);
}
