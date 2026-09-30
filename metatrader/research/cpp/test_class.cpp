// Unit test of the MT5-facing helpers that need no broker: symbol classification and anchor-string parsing (KzBroker.mqh, transpiled).
#include "mql5_shim.h"
MockEnv g_env; int g_shimVerbose = 0; std::string g_shimComment;
#include <KuzeEdge/KzBroker.mqh>

struct Case { const char* sym; int cls; };
int main() {
   static const Case cases[] = {
      // forex (incl. every D..J / D..N / U..S accident that a naive substring search could trip over)
      {"EURUSD", KZ_CLASS_FX}, {"GBPUSD", KZ_CLASS_FX}, {"USDJPY", KZ_CLASS_FX}, {"AUDJPY", KZ_CLASS_FX}, {"NZDJPY", KZ_CLASS_FX},
      {"CADJPY", KZ_CLASS_FX}, {"CHFJPY", KZ_CLASS_FX}, {"EURJPY", KZ_CLASS_FX}, {"GBPJPY", KZ_CLASS_FX}, {"USDCAD", KZ_CLASS_FX},
      {"USDCHF", KZ_CLASS_FX}, {"AUDUSD", KZ_CLASS_FX}, {"NZDUSD", KZ_CLASS_FX}, {"EURGBP", KZ_CLASS_FX}, {"EURCHF", KZ_CLASS_FX},
      {"EURAUD", KZ_CLASS_FX}, {"EURNZD", KZ_CLASS_FX}, {"GBPAUD", KZ_CLASS_FX}, {"AUDNZD", KZ_CLASS_FX}, {"USDSEK", KZ_CLASS_FX},
      {"USDNOK", KZ_CLASS_FX}, {"USDMXN", KZ_CLASS_FX}, {"USDZAR", KZ_CLASS_FX}, {"USDTRY", KZ_CLASS_FX}, {"USDHKD", KZ_CLASS_FX},
      {"USDSGD", KZ_CLASS_FX}, {"USDCNH", KZ_CLASS_FX}, {"EURUSD.a", KZ_CLASS_FX}, {"EURUSDm", KZ_CLASS_FX}, {"EURUSD.pro", KZ_CLASS_FX},
      {"EURUSD#", KZ_CLASS_FX}, {"usdjpy", KZ_CLASS_FX},
      // metals / energy
      {"XAUUSD", KZ_CLASS_METAL}, {"XAGUSD", KZ_CLASS_METAL}, {"GOLD", KZ_CLASS_METAL}, {"SILVER", KZ_CLASS_METAL}, {"XAUEUR", KZ_CLASS_METAL},
      {"XPTUSD", KZ_CLASS_METAL}, {"XPDUSD", KZ_CLASS_METAL}, {"XAUUSD.r", KZ_CLASS_METAL},
      {"XTIUSD", KZ_CLASS_ENERGY}, {"XBRUSD", KZ_CLASS_ENERGY}, {"USOIL", KZ_CLASS_ENERGY}, {"UKOIL", KZ_CLASS_ENERGY}, {"WTI", KZ_CLASS_ENERGY},
      {"BRENT", KZ_CLASS_ENERGY}, {"NGAS", KZ_CLASS_ENERGY}, {"XNGUSD", KZ_CLASS_ENERGY},
      // crypto
      {"BTCUSD", KZ_CLASS_CRYPTO}, {"ETHUSD", KZ_CLASS_CRYPTO}, {"LTCUSD", KZ_CLASS_CRYPTO}, {"XRPUSD", KZ_CLASS_CRYPTO}, {"SOLUSD", KZ_CLASS_CRYPTO},
      {"DOGEUSD", KZ_CLASS_CRYPTO}, {"BNBUSD", KZ_CLASS_CRYPTO}, {"BTCEUR", KZ_CLASS_CRYPTO},
      // US indices
      {"US100", KZ_CLASS_US_INDEX}, {"NAS100", KZ_CLASS_US_INDEX}, {"USTEC", KZ_CLASS_US_INDEX}, {"NDX100", KZ_CLASS_US_INDEX}, {"NQ", KZ_CLASS_US_INDEX},
      {"US500", KZ_CLASS_US_INDEX}, {"SPX500", KZ_CLASS_US_INDEX}, {"SP500", KZ_CLASS_US_INDEX}, {"US30", KZ_CLASS_US_INDEX}, {"DJ30", KZ_CLASS_US_INDEX},
      {"DJI30", KZ_CLASS_US_INDEX}, {"WS30", KZ_CLASS_US_INDEX}, {"DOW30", KZ_CLASS_US_INDEX}, {"USA500IDXUSD", KZ_CLASS_US_INDEX},
      {"USATECHIDXUSD", KZ_CLASS_US_INDEX}, {"USA30IDXUSD", KZ_CLASS_US_INDEX}, {"US2000", KZ_CLASS_US_INDEX}, {"NAS100.cash", KZ_CLASS_US_INDEX},
      // European indices
      {"DE40", KZ_CLASS_EU_INDEX}, {"GER40", KZ_CLASS_EU_INDEX}, {"GER30", KZ_CLASS_EU_INDEX}, {"DE30", KZ_CLASS_EU_INDEX}, {"DAX40", KZ_CLASS_EU_INDEX},
      {"DEUIDXEUR", KZ_CLASS_EU_INDEX}, {"UK100", KZ_CLASS_EU_INDEX}, {"FTSE100", KZ_CLASS_EU_INDEX}, {"GBRIDXGBP", KZ_CLASS_EU_INDEX},
      {"FRA40", KZ_CLASS_EU_INDEX}, {"CAC40", KZ_CLASS_EU_INDEX}, {"EU50", KZ_CLASS_EU_INDEX}, {"STOXX50", KZ_CLASS_EU_INDEX},
      {"ESP35", KZ_CLASS_EU_INDEX}, {"IBEX35", KZ_CLASS_EU_INDEX}, {"IT40", KZ_CLASS_EU_INDEX},
   };
   int bad = 0, n = 0;
   for(const Case& c : cases) {
      int got = KzDetectClass(c.sym); n++;
      if(got != c.cls) { printf("MISCLASSIFIED %-16s -> %-9s expected %s\n", c.sym, KzClassName(got).c_str(), KzClassName(c.cls).c_str()); bad++; }
   }
   // anchor parsing
   KzConfig cfg; memset(&cfg, 0, sizeof cfg);
   int added = KzParseAnchors("NY0930, lon0800 ,BAD,UTC2460,TYO0900,FRA09,NY", cfg, 1);
   if(added != 3 || cfg.nAnchors != 3) { printf("anchor parsing: expected 3 valid anchors, got %d\n", added); bad++; }
   else if(cfg.anchors[0].clock != KZ_CLK_NY || cfg.anchors[0].minute != 570 || cfg.anchors[1].clock != KZ_CLK_LON || cfg.anchors[1].minute != 480 ||
           cfg.anchors[2].clock != KZ_CLK_TYO || cfg.anchors[2].minute != 540) { printf("anchor parsing: wrong clock/minute\n"); bad++; }
   // presets: no two anchors of a class may be the SAME instant (e.g. London 08:00 == Frankfurt 09:00): duplicates would double-count evidence
   {
      const long long days[2] = {1704067200LL + 15 * 86400LL, 1719792000LL + 15 * 86400LL};   // mid-January and mid-July 2024, 00:00 UTC
      for(int cls = KZ_CLASS_US_INDEX; cls <= KZ_CLASS_CRYPTO; cls++) {
         KzConfig pc; memset(&pc, 0, sizeof pc); KzBuildPreset(pc, cls, 0);
         for(int i = 0; i < pc.nAnchors; i++) for(int j = i + 1; j < pc.nAnchors; j++) {
            if((pc.anchors[i].wdMask & pc.anchors[j].wdMask) == 0) continue;
            for(int d = 0; d < 2; d++) {
               long long t0 = days[d];
               int ui = ((pc.anchors[i].minute - KzClockOffset(t0 + 43200, pc.anchors[i].clock) / 60) % 1440 + 1440) % 1440;
               int uj = ((pc.anchors[j].minute - KzClockOffset(t0 + 43200, pc.anchors[j].clock) / 60) % 1440 + 1440) % 1440;
               if(ui == uj) { printf("preset %s: anchors %d and %d are the same instant (%02d:%02d UTC)\n", KzClassName(cls).c_str(), i, j, ui / 60, ui % 60); bad++; }
            }
         }
      }
   }
   printf("%d symbols + anchor parsing + preset uniqueness checked, %d problems\n", n, bad);
   printf(bad == 0 ? "CLASS TESTS PASSED\n" : "CLASS TESTS FAILED\n");
   return bad == 0 ? 0 : 1;
}
