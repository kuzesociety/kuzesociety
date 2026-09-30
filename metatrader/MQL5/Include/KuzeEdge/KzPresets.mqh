//+------------------------------------------------------------------+
//| KzPresets.mqh - market classes and their default session anchors. |
//| Pure logic (no MT5 calls, no strings) so it is unit-tested.       |
//|                                                                  |
//| EVIDENCE POLICY (see docs/VALIDATION_REPORT.md):                  |
//|  * every sleeve runs at every relevant anchor as a SHADOW trade    |
//|    (measured, never risked) so each user gets evidence from their  |
//|    own broker feed;                                                |
//|  * only cells with supporting evidence are LIVE-ELIGIBLE by        |
//|    default: S1 (box reclaim, volume-gated) on US index anchors.    |
//+------------------------------------------------------------------+
#ifndef KZ_PRESETS_MQH
#define KZ_PRESETS_MQH

#include "KzTypes.mqh"

#define KZ_CLASS_AUTO      0
#define KZ_CLASS_US_INDEX  1
#define KZ_CLASS_EU_INDEX  2
#define KZ_CLASS_FX        3
#define KZ_CLASS_METAL     4
#define KZ_CLASS_ENERGY    5
#define KZ_CLASS_CRYPTO    6
#define KZ_CLASS_CUSTOM    7

#define KZ_ALLSLEEVES      31            // bits 0..4
#define KZ_WD_MONFRI       31            // Mon..Fri
#define KZ_WD_SUNTHU       (64 | 1 | 2 | 4 | 8)   // Sun(6),Mon,Tue,Wed,Thu  (session opens that start the next trading day)
#define KZ_WD_ALL          127

void KzAddAnchor(KzConfig &cfg, const int clock, const int hhmm, const int wdMask, const int sleeveMask, const int liveMask)
{
   if(cfg.nAnchors >= KZ_MAX_ANCHORS) return;
   KzAnchorDef a;
   a.clock = clock;
   a.minute = (hhmm / 100) * 60 + (hhmm % 100);
   a.wdMask = wdMask;
   a.sleeveMask = sleeveMask;
   a.liveMask = liveMask & sleeveMask;
   a.id = clock * 10000 + hhmm;
   cfg.anchors[cfg.nAnchors] = a;
   cfg.nAnchors++;
}

//--- install the default anchor set of a market class. `extraLive` = user opt-in bitmask of sleeves that may
//    trade live on EVERY anchor of the class (default 0 = evidence-based cells only).
void KzBuildPreset(KzConfig &cfg, const int cls, const int extraLive)
{
   cfg.nAnchors = 0;
   const int S1 = 1;
   switch(cls)
   {
      case KZ_CLASS_US_INDEX:
         KzAddAnchor(cfg, KZ_CLK_NY,  930, KZ_WD_MONFRI, KZ_ALLSLEEVES, S1 | extraLive);   // cash open
         KzAddAnchor(cfg, KZ_CLK_NY, 1000, KZ_WD_MONFRI, S1,            S1 | extraLive);   // 10:00 hour open
         KzAddAnchor(cfg, KZ_CLK_NY, 1100, KZ_WD_MONFRI, S1,            extraLive);        // shadow only (negative in sample)
         KzAddAnchor(cfg, KZ_CLK_NY, 1300, KZ_WD_MONFRI, S1 | 2,        S1 | extraLive);   // "1PM"
         KzAddAnchor(cfg, KZ_CLK_NY, 1400, KZ_WD_MONFRI, S1,            extraLive);        // too few samples
         KzAddAnchor(cfg, KZ_CLK_NY, 1800, KZ_WD_SUNTHU, S1 | 16,       extraLive);        // Globex re-open
         break;
      case KZ_CLASS_EU_INDEX:
         KzAddAnchor(cfg, KZ_CLK_LON,  800, KZ_WD_MONFRI, KZ_ALLSLEEVES, extraLive);   // = 09:00 Frankfurt (same instant: one anchor, not two)
         KzAddAnchor(cfg, KZ_CLK_NY,   930, KZ_WD_MONFRI, S1 | 2,        extraLive);
         KzAddAnchor(cfg, KZ_CLK_NY,  1300, KZ_WD_MONFRI, S1,            extraLive);
         break;
      case KZ_CLASS_METAL:
      case KZ_CLASS_ENERGY:
         KzAddAnchor(cfg, KZ_CLK_TYO,  900, KZ_WD_MONFRI, KZ_ALLSLEEVES, extraLive);
         KzAddAnchor(cfg, KZ_CLK_LON,  800, KZ_WD_MONFRI, KZ_ALLSLEEVES, extraLive);
         KzAddAnchor(cfg, KZ_CLK_NY,   830, KZ_WD_MONFRI, KZ_ALLSLEEVES, extraLive);
         KzAddAnchor(cfg, KZ_CLK_NY,   930, KZ_WD_MONFRI, KZ_ALLSLEEVES, extraLive);
         KzAddAnchor(cfg, KZ_CLK_NY,  1300, KZ_WD_MONFRI, S1 | 2,        extraLive);
         KzAddAnchor(cfg, KZ_CLK_NY,  1800, KZ_WD_SUNTHU, S1 | 16,       extraLive);
         break;
      case KZ_CLASS_CRYPTO:
         KzAddAnchor(cfg, KZ_CLK_UTC,    0, KZ_WD_ALL, KZ_ALLSLEEVES, extraLive);
         KzAddAnchor(cfg, KZ_CLK_UTC,  800, KZ_WD_ALL, KZ_ALLSLEEVES, extraLive);
         KzAddAnchor(cfg, KZ_CLK_UTC, 1330, KZ_WD_ALL, KZ_ALLSLEEVES, extraLive);
         KzAddAnchor(cfg, KZ_CLK_UTC, 1600, KZ_WD_ALL, KZ_ALLSLEEVES, extraLive);
         break;
      case KZ_CLASS_FX:
      default:
         KzAddAnchor(cfg, KZ_CLK_TYO,  900, KZ_WD_MONFRI, KZ_ALLSLEEVES, extraLive);
         KzAddAnchor(cfg, KZ_CLK_LON,  800, KZ_WD_MONFRI, KZ_ALLSLEEVES, extraLive);
         KzAddAnchor(cfg, KZ_CLK_NY,   800, KZ_WD_MONFRI, KZ_ALLSLEEVES, extraLive);
         KzAddAnchor(cfg, KZ_CLK_NY,   930, KZ_WD_MONFRI, S1 | 2,        extraLive);
         KzAddAnchor(cfg, KZ_CLK_NY,  1300, KZ_WD_MONFRI, S1,            extraLive);
         KzAddAnchor(cfg, KZ_CLK_NY,  1800, KZ_WD_SUNTHU, S1 | 16,       extraLive);
         break;
   }
}

#endif
