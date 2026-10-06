//+------------------------------------------------------------------+
//| KuzeExport.mq5 - export your broker's own bars for the research   |
//| kit (research/scripts/07_evaluate_export.py).                     |
//|                                                                  |
//| Writes  <Terminal>\Common\Files\KuzeEdge\export_<symbol>_<tf>.csv |
//|   utc,open,high,low,close,tick_volume,spread                      |
//| utc      = bar OPEN time converted from the broker's server clock  |
//| prices   = BID OHLC                                               |
//| spread   = the bar's spread in PRICE units (points x point size)  |
//|                                                                  |
//| Use your real broker's history: it contains YOUR spreads and      |
//| YOUR tick volume, which is exactly what decides whether a setup   |
//| is tradable on your account.                                      |
//+------------------------------------------------------------------+
#property copyright "kuzesociety"
#property link      "https://github.com/kuzesociety/kuzesociety"
#property version   "1.00"
#property description "Exports bars (UTC time, bid OHLC, tick volume, spread) to CSV for the KuzeEdge research kit."
#property script_show_inputs

#include <KuzeEdge/KzTime.mqh>

enum ENUM_KZX_SRV
{
   KZX_AUTO    = 0,   // Auto (New-York-close server: server = New York + 7h)
   KZX_NYCLOSE = 1,   // Server = New York + 7h (GMT+2 winter / GMT+3 summer, US DST)
   KZX_EUDST   = 2,   // Server = UTC+2 winter / UTC+3 summer (EU DST)
   KZX_FIXED   = 3    // Fixed UTC offset (InpServerFixedHours), no DST
};

input string          InpSymbol           = "";            // Symbol ("" = the chart's symbol)
input ENUM_TIMEFRAMES InpTimeframe        = PERIOD_M5;     // Timeframe (M1 or M5 recommended)
input datetime        InpFrom             = D'2023.01.01 00:00'; // First bar (server time)
input datetime        InpTo               = 0;             // Last bar (server time, 0 = now)
input ENUM_KZX_SRV    InpServerMode       = KZX_AUTO;      // Broker server time convention
input int             InpServerFixedHours = 0;             // Fixed UTC offset in hours (FIXED mode only)

string TfName(const ENUM_TIMEFRAMES tf)
{
   string s = EnumToString(tf);            // PERIOD_M5
   StringReplace(s, "PERIOD_", "");
   return s;
}

void OnStart()
{
   string sym = (StringLen(InpSymbol) > 0) ? InpSymbol : _Symbol;
   if(!SymbolSelect(sym, true))
   {
      Print("KuzeExport: symbol not available: ", sym);
      return;
   }
   int mode = KZ_SRV_NYCLOSE;
   if(InpServerMode == KZX_EUDST) mode = KZ_SRV_EUDST;
   if(InpServerMode == KZX_FIXED) mode = KZ_SRV_FIXED;
   int fixedSec = InpServerFixedHours * 3600;

   double point = SymbolInfoDouble(sym, SYMBOL_POINT);
   int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   datetime to = (InpTo > 0) ? InpTo : TimeCurrent();
   string fileName = "KuzeEdge\\export_" + sym + "_" + TfName(InpTimeframe) + ".csv";
   FolderCreate("KuzeEdge", FILE_COMMON);                       // no-op if it already exists
   int h = FileOpen(fileName, FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_COMMON);
   if(h == INVALID_HANDLE)
   {
      Print("KuzeExport: cannot open ", fileName, " (error ", GetLastError(), ")");
      return;
   }
   FileWriteString(h, "utc,open,high,low,close,tick_volume,spread\n");

   long total = 0;
   datetime cur = InpFrom;
   string buf = "";
   int bufLines = 0;
   while(cur < to)
   {
      datetime nxt = cur + 31 * 86400;         // walk in ~monthly chunks so the terminal loads its history block by block
      if(nxt > to) nxt = to;
      MqlRates r[];
      int n = CopyRates(sym, InpTimeframe, cur, nxt - 1, r);
      for(int attempt = 0; attempt < 8 && n < 0; attempt++)   // history still being built by the terminal: wait and retry
      {
         Sleep(400);
         n = CopyRates(sym, InpTimeframe, cur, nxt - 1, r);
      }
      if(n < 0)
      {
         Print("KuzeExport: CopyRates failed for ", TimeToString(cur), " (error ", GetLastError(), "); the file is incomplete from this date");
         break;
      }
      for(int i = 0; i < n; i++)
      {
         long utc = KzServerToUtc((long)r[i].time, mode, fixedSec);
         buf += TimeToString((datetime)utc, TIME_DATE | TIME_SECONDS) + "," +
                DoubleToString(r[i].open, digits) + "," + DoubleToString(r[i].high, digits) + "," +
                DoubleToString(r[i].low, digits) + "," + DoubleToString(r[i].close, digits) + "," +
                IntegerToString(r[i].tick_volume) + "," + DoubleToString(r[i].spread * point, digits) + "\n";
         bufLines++;
         total++;
         if(bufLines >= 5000)
         {
            FileWriteString(h, buf);
            buf = "";
            bufLines = 0;
         }
      }
      cur = nxt;
   }
   if(bufLines > 0) FileWriteString(h, buf);
   FileClose(h);
   Print("KuzeExport: wrote ", total, " bars of ", sym, " ", TfName(InpTimeframe), " to Common\\Files\\", fileName);
   Comment("KuzeExport: wrote ", total, " bars to Common\\Files\\", fileName);
}
