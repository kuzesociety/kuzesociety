//+------------------------------------------------------------------+
//| KzBroker.mqh - MetaTrader-facing helpers (symbol info, positions, |
//| deals, ledger file, class detection). The ONLY include that calls |
//| the MT5 API; all trading logic lives in the pure includes.        |
//+------------------------------------------------------------------+
#ifndef KZ_BROKER_MQH
#define KZ_BROKER_MQH

#include <Trade\Trade.mqh>
#include "KzTypes.mqh"
#include "KzUtil.mqh"
#include "KzTime.mqh"
#include "KzPresets.mqh"

//--- names --------------------------------------------------------------
string KzSleeveName(const int s)
{
   switch(s)
   {
      case KZ_S1_BOXRECLAIM:  return "S1_BoxReclaim";
      case KZ_S2_OPENEXHAUST: return "S2_OpenExhaust";
      case KZ_S3_IBBREAK:     return "S3_IBBreak";
      case KZ_S4_OPENRETEST:  return "S4_OpenRetest";
      case KZ_S5_LEVELSWEEP:  return "S5_LevelSweep";
   }
   return "S?";
}

string KzClassName(const int c)
{
   switch(c)
   {
      case KZ_CLASS_US_INDEX: return "US_INDEX";
      case KZ_CLASS_EU_INDEX: return "EU_INDEX";
      case KZ_CLASS_FX:       return "FX";
      case KZ_CLASS_METAL:    return "METAL";
      case KZ_CLASS_ENERGY:   return "ENERGY";
      case KZ_CLASS_CRYPTO:   return "CRYPTO";
      case KZ_CLASS_CUSTOM:   return "CUSTOM";
   }
   return "AUTO";
}

string KzClockName(const int c)
{
   switch(c)
   {
      case KZ_CLK_NY:  return "NY";
      case KZ_CLK_LON: return "LON";
      case KZ_CLK_FRA: return "FRA";
      case KZ_CLK_TYO: return "TYO";
   }
   return "UTC";
}

string KzExitName(const int r)
{
   switch(r)
   {
      case KZ_X_TP:      return "TP";
      case KZ_X_SL:      return "SL";
      case KZ_X_TIME:    return "TIME";
      case KZ_X_FLAT:    return "FLAT";
      case KZ_X_NOPROG:  return "NOPROG";
      case KZ_X_DATAEND: return "END";
   }
   return "-";
}

bool KzHasToken(const string upper, const string token)
{
   return (StringFind(upper, token) >= 0);
}

//--- classify a symbol from its name (case-insensitive substring tokens)
int KzDetectClass(const string symbol)
{
   string u = symbol;
   StringToUpper(u);
   if(KzHasToken(u, "BTC") || KzHasToken(u, "ETH") || KzHasToken(u, "LTC") || KzHasToken(u, "XRP") ||
      KzHasToken(u, "SOL") || KzHasToken(u, "DOGE") || KzHasToken(u, "BNB"))
      return KZ_CLASS_CRYPTO;
   if(KzHasToken(u, "XAU") || KzHasToken(u, "XAG") || KzHasToken(u, "GOLD") || KzHasToken(u, "SILVER") ||
      KzHasToken(u, "XPT") || KzHasToken(u, "XPD"))
      return KZ_CLASS_METAL;
   if(KzHasToken(u, "XTI") || KzHasToken(u, "XBR") || KzHasToken(u, "WTI") || KzHasToken(u, "BRENT") ||
      KzHasToken(u, "USOIL") || KzHasToken(u, "UKOIL") || KzHasToken(u, "NGAS") || KzHasToken(u, "XNG"))
      return KZ_CLASS_ENERGY;
   if(KzHasToken(u, "NAS") || KzHasToken(u, "NDX") || KzHasToken(u, "USTEC") || KzHasToken(u, "US100") ||
      KzHasToken(u, "US500") || KzHasToken(u, "SPX") || KzHasToken(u, "SP500") || KzHasToken(u, "US30") ||
      KzHasToken(u, "DJ30") || KzHasToken(u, "DJI") || KzHasToken(u, "DOW") || KzHasToken(u, "WS30") || KzHasToken(u, "USA30") ||
      KzHasToken(u, "USA500") || KzHasToken(u, "USATECH") || KzHasToken(u, "US2000") || KzHasToken(u, "RTY") ||
      KzHasToken(u, "NQ"))
      return KZ_CLASS_US_INDEX;
   if(KzHasToken(u, "GER") || KzHasToken(u, "DE40") || KzHasToken(u, "DE30") || KzHasToken(u, "DAX") ||
      KzHasToken(u, "DEUIDX") || KzHasToken(u, "UK100") || KzHasToken(u, "FTSE") || KzHasToken(u, "GBRIDX") ||
      KzHasToken(u, "FRA40") || KzHasToken(u, "CAC") || KzHasToken(u, "EU50") || KzHasToken(u, "STOXX") ||
      KzHasToken(u, "ESP35") || KzHasToken(u, "IBEX") || KzHasToken(u, "IT40"))
      return KZ_CLASS_EU_INDEX;
   return KZ_CLASS_FX;
}

//--- broker / symbol constants needed for sizing and order checks ---------
struct KzSymInfo
{
   double point;
   int    digits;
   double tickSize;
   double tickValueLoss;
   double minLot, maxLot, lotStep;
   double stopsLevel;     // price units
   double freezeLevel;    // price units
};

bool KzLoadSymInfo(const string sym, KzSymInfo &s)
{
   s.point  = SymbolInfoDouble(sym, SYMBOL_POINT);
   s.digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   s.tickSize = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_SIZE);
   if(s.tickSize <= 0.0) s.tickSize = s.point;
   double tvl = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE_LOSS);
   if(tvl <= 0.0) tvl = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE);
   s.tickValueLoss = tvl;
   s.minLot  = SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN);
   s.maxLot  = SymbolInfoDouble(sym, SYMBOL_VOLUME_MAX);
   s.lotStep = SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP);
   s.stopsLevel  = (double)SymbolInfoInteger(sym, SYMBOL_TRADE_STOPS_LEVEL)  * s.point;
   s.freezeLevel = (double)SymbolInfoInteger(sym, SYMBOL_TRADE_FREEZE_LEVEL) * s.point;
   return (s.point > 0.0 && s.tickSize > 0.0 && s.tickValueLoss > 0.0 && s.minLot > 0.0 && s.lotStep > 0.0);
}

ENUM_ORDER_TYPE_FILLING KzPickFilling(const string sym)
{
   int fm = (int)SymbolInfoInteger(sym, SYMBOL_FILLING_MODE);
   if((fm & SYMBOL_FILLING_IOC) != 0) return ORDER_FILLING_IOC;
   if((fm & SYMBOL_FILLING_FOK) != 0) return ORDER_FILLING_FOK;
   return ORDER_FILLING_RETURN;
}

//--- price helpers ---------------------------------------------------------
double KzNormPrice(const double price, const int digits)
{
   return NormalizeDouble(price, digits);
}

//--- tracked live position ----------------------------------------------------
struct KzLive
{
   int         has;
   ulong       ticket;
   long        posId;
   int         sleeve, anchor;
   double      lots;
   double      riskMoney;
   KzShadowPos p;          // entry/sl/tp/time-limits/best-excursion in the SAME form the shadow simulator uses
};

//--- find our open position on this symbol (one position per symbol policy)
bool KzFindPosition(const string sym, const long magic, ulong &ticket, long &posId, int &dir,
                    double &priceOpen, double &sl, double &tp, double &volume, datetime &tOpen)
{
   int n = PositionsTotal();
   for(int i = 0; i < n; i++)
   {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != sym) continue;
      if(PositionGetInteger(POSITION_MAGIC) != magic) continue;
      ticket    = tk;
      posId     = PositionGetInteger(POSITION_IDENTIFIER);
      dir       = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) ? 1 : -1;
      priceOpen = PositionGetDouble(POSITION_PRICE_OPEN);
      sl        = PositionGetDouble(POSITION_SL);
      tp        = PositionGetDouble(POSITION_TP);
      volume    = PositionGetDouble(POSITION_VOLUME);
      tOpen     = (datetime)PositionGetInteger(POSITION_TIME);
      return true;
   }
   return false;
}

//--- net realised result of a position (profit + swap + commission over all its deals)
double KzPositionResult(const long posId)
{
   if(!HistorySelectByPosition(posId)) return 0.0;
   double total = 0.0;
   int n = HistoryDealsTotal();
   for(int i = 0; i < n; i++)
   {
      ulong d = HistoryDealGetTicket(i);
      if(d == 0) continue;
      total += HistoryDealGetDouble(d, DEAL_PROFIT) + HistoryDealGetDouble(d, DEAL_SWAP) + HistoryDealGetDouble(d, DEAL_COMMISSION);
   }
   return total;
}

//--- CSV ledger (buffered) -----------------------------------------------------
string g_kzLedgerBuf = "";

void KzLedgerAdd(const string line)
{
   g_kzLedgerBuf += line + "\n";
}

void KzLedgerFlush(const string fileName, const string header)
{
   if(StringLen(g_kzLedgerBuf) == 0) return;
   FolderCreate("KuzeEdge", FILE_COMMON);                      // no-op if it already exists
   int h = FileOpen(fileName, FILE_READ | FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_COMMON);
   if(h == INVALID_HANDLE) { g_kzLedgerBuf = ""; return; }
   if(FileSize(h) == 0) FileWriteString(h, header + "\n");
   FileSeek(h, 0, SEEK_END);
   FileWriteString(h, g_kzLedgerBuf);
   FileClose(h);
   g_kzLedgerBuf = "";
}

string KzIso(const KZ_LONG utc)
{
   return TimeToString((datetime)utc, TIME_DATE | TIME_MINUTES | TIME_SECONDS);
}

//--- parse "NY0930,LON0800,TYO0900,FRA0900,UTC1330" into anchors (all sleeves shadow-evaluated)
int KzParseAnchors(const string spec, KzConfig &cfg, const int liveMask)
{
   string parts[];
   int n = StringSplit(spec, ',', parts);
   int added = 0;
   for(int i = 0; i < n; i++)
   {
      string t = parts[i];
      StringTrimLeft(t); StringTrimRight(t);
      StringToUpper(t);
      if(StringLen(t) < 5) continue;
      string cn = StringSubstr(t, 0, StringLen(t) - 4);
      int hhmm = (int)StringToInteger(StringSubstr(t, StringLen(t) - 4, 4));
      int clock = KZ_CLK_UTC;
      if(cn == "NY")  clock = KZ_CLK_NY;
      else if(cn == "LON") clock = KZ_CLK_LON;
      else if(cn == "FRA") clock = KZ_CLK_FRA;
      else if(cn == "TYO") clock = KZ_CLK_TYO;
      else if(cn == "UTC") clock = KZ_CLK_UTC;
      else continue;
      if(hhmm < 0 || hhmm > 2359 || (hhmm % 100) > 59) continue;
      int before = cfg.nAnchors;
      KzAddAnchor(cfg, clock, hhmm, KZ_WD_MONFRI, KZ_ALLSLEEVES, liveMask);
      if(cfg.nAnchors > before) added++;
   }
   return added;
}

#endif
