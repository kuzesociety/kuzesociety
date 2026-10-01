//+------------------------------------------------------------------+
//| KzTypes.mqh - shared constants, enums and plain-data structs.     |
//|                                                                  |
//| PORTABILITY RULE: everything under Include/KuzeEdge except        |
//| KzBroker.mqh is written in the subset of MQL5 that is also valid  |
//| C++17 (no strings, no dynamic arrays, no MT5 API calls). The     |
//| research harness (research/cpp) compiles this exact code with     |
//| g++ and runs it on real market data, so the logic that trades is  |
//| the logic that was tested.                                        |
//+------------------------------------------------------------------+
#ifndef KZ_TYPES_MQH
#define KZ_TYPES_MQH

#ifndef __MQL5__
   // ---- C++ build (research harness): give MQL5 scalar names ----
   #include <cstdint>
   #include <cmath>
   #include <cstring>
   typedef long long   datetime;
   typedef long long   klong;
   typedef unsigned char uchar;
   typedef unsigned int  uint;
   #define KZ_LONG long long
#else
   #define KZ_LONG long
#endif

//--- capacities (all state is statically sized; no heap use) ---------
#define KZ_WIN            256      // max bars kept per anchor window
#define KZ_MAX_ANCHORS    12
#define KZ_MAX_SLEEVES    5
#define KZ_NPARAM         16
#define KZ_MAX_SHADOW     48       // concurrent shadow positions
#define KZ_MAX_PENDING    32       // signals waiting for their entry bar
#define KZ_MAX_CLOSED     512      // ring of closed shadow trades for export
#define KZ_STAT_RING      256      // rolling window of R values per cell
#define KZ_DAYHIST        16
#define KZ_BOXHIST        20
#define KZ_MAXW           200      // max contiguous bars evaluated per window

//--- sleeves ---------------------------------------------------------
#define KZ_S1_BOXRECLAIM  0        // false-break of the opening box, close back inside (chat: "1PM")
#define KZ_S2_OPENEXHAUST 1        // fade an exhausted opening drive toward the open (chat: "10:15 reversal")
#define KZ_S3_IBBREAK     2        // initial-balance break with volume (chat: "drive real")
#define KZ_S4_OPENRETEST  3        // retest of the open in the direction of the day
#define KZ_S5_LEVELSWEEP  4        // PDH/PDL sweep and reclaim

//--- clocks ----------------------------------------------------------
#define KZ_CLK_NY   0
#define KZ_CLK_LON  1
#define KZ_CLK_FRA  2
#define KZ_CLK_TYO  3
#define KZ_CLK_UTC  4

//--- broker server-time conventions ----------------------------------
#define KZ_SRV_NYCLOSE 0   // server = New York + 7h (GMT+2 winter / GMT+3 summer, US DST). Most FX/CFD brokers.
#define KZ_SRV_EUDST   1   // server = UTC+2 winter / UTC+3 summer following EU DST
#define KZ_SRV_FIXED   2   // fixed offset (hours*3600) from UTC, no DST

//--- exit reasons ----------------------------------------------------
#define KZ_X_NONE     0
#define KZ_X_TP       1
#define KZ_X_SL       2
#define KZ_X_TIME     3
#define KZ_X_FLAT     4
#define KZ_X_NOPROG   5
#define KZ_X_DATAEND  6

//--- data structs ------------------------------------------------------
struct KzBar
{
   KZ_LONG t;          // bar OPEN time, UTC seconds
   double  o, h, l, c; // bid OHLC
   double  v;          // tick volume
   double  sp;         // spread in price units (ask - bid) for this bar
};

struct KzWin           // bars of one anchor-day, index 0 = anchor bar
{
   int     n;
   KZ_LONG t[KZ_WIN];
   double  o[KZ_WIN], h[KZ_WIN], l[KZ_WIN], c[KZ_WIN], v[KZ_WIN];
};

struct KzP { double p[KZ_NPARAM]; };   // sleeve parameter vector

struct KzCtx           // context frozen at anchor time
{
   double pdh, pdl;    // previous session-day high / low  (0 if unknown)
   double dref;        // median daily range of last 10 session days (0 if unknown)
   double boxBase;     // mean of the last <=20 box heights of this anchor (0 if < 5 samples)
};

struct KzSigOut        // raw output of a sleeve function
{
   int    found;
   int    j;           // window index of the signal bar
   int    dir;         // +1 long / -1 short
   double sl, tp;
   double maxHoldMin;
   double ref;         // entry reference = signal bar close
   double noProgMin, noProgR;
};

struct KzSignal        // a sleeve signal ready to be traded (shadow and/or live)
{
   int     sleeve;
   int     anchor;
   int     dir;
   KZ_LONG tSigOpen;   // signal bar open time (UTC)
   KZ_LONG tDue;       // signal bar close time = earliest entry time
   double  ref, sl, tp;
   double  maxHoldMin, noProgMin, noProgR;
   double  riskRef;    // |ref - sl|
   int     eligible;   // 1 if this sleeve/anchor is live-eligible by preset / user opt-in
   int     live;       // 1 if eligible AND the evidence gate passed at signal time
};

struct KzShadowPos     // simulated position (also used to track the real one)
{
   int     used;
   int     sleeve, anchor, dir;
   KZ_LONG tSig, tEntry, tEnd, tNoProg;
   double  entry, sl, tp;
   double  best;       // best favourable excursion so far (price units)
   double  rPlan;      // |ref - sl|
   double  risk;       // |entry - sl|  (R0)
   double  noProgR;
   int     noProgOn;
   int     wasLive;
   double  sp;         // spread (price units) of the entry bar
};

struct KzClosed        // closed shadow trade record
{
   int     sleeve, anchor, dir, reason, wasLive;
   KZ_LONG tSig, tEntry, tExit;
   double  entry, exitPx, sl, tp, risk, r, spread;
};

struct KzCell          // rolling statistics of R multiples
{
   int    head, cnt;
   double r[KZ_STAT_RING];
   double sum, sumsq;  // over the whole ring content
};

struct KzAnchorDef
{
   int clock;          // KZ_CLK_*
   int minute;         // minute of local day (0..1439)
   int wdMask;         // bit i set = local weekday i allowed (0=Mon .. 6=Sun)
   int sleeveMask;     // bit s set = sleeve s evaluated (shadow-traded) at this anchor
   int liveMask;       // bit s set = sleeve s may trade LIVE at this anchor (still subject to gate / mode)
   int id;             // stable identifier used in logs (e.g. hhmm)
};

struct KzConfig
{
   int         sigMin;             // signal bar minutes (1, 5 or 15)
   int         chartMin;           // chart bar minutes (<= sigMin, divides sigMin)
   int         nAnchors;
   KzAnchorDef anchors[KZ_MAX_ANCHORS];
   KzP         P[KZ_MAX_SLEEVES];
   int         flatMin;            // New-York minute-of-day to flatten (e.g. 16*60+50), -1 = off
   double      slip;               // per-side slippage assumed by shadow sim (price units)
   double      maxCostFrac;        // skip signals whose spread / risk exceeds this
   int         execGapSec;         // max delay between signal-bar close and entry bar open
   int         minToFlatMin;       // drop signals due less than this many minutes before the next flat time (0 = off)
   int         ctxFilter;          // chat "hard filters" (bitmask, 0 = off): 1 = no shorts above PDH AND above the open, 2 = no longs at/below PDL
   int         minWinBars;         // evaluate an anchor window only once it holds this many bars (research parity: 1)
   int         srvMode;            // KZ_SRV_*
   int         srvFixedSec;        // used when srvMode == KZ_SRV_FIXED
   // evidence gate
   int         gateN;              // rolling window (shadow trades)
   int         gateMinN;
   double      gateTheta;          // min shrunk mean R
   double      gateZ;              // min t-stat
   double      gatePriorK;
   double      gatePriorMu;
   int         gateLevelCell;      // 1 = per (sleeve,anchor), 0 = per sleeve
};

#endif
