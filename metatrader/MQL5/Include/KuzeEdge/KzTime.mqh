//+------------------------------------------------------------------+
//| KzTime.mqh - DST-aware clocks and broker server-time conversion.  |
//| All functions are pure integer math (no MT5 calls), so the exact  |
//| same code runs inside MetaTrader and inside the research harness. |
//+------------------------------------------------------------------+
#ifndef KZ_TIME_MQH
#define KZ_TIME_MQH

#include "KzTypes.mqh"

//--- days since 1970-01-01 for a civil date (Howard Hinnant's algorithm)
KZ_LONG KzDaysFromCivil(int y, const int m, const int d)
{
   if(m <= 2) y -= 1;
   KZ_LONG era = (y >= 0 ? y : y - 399) / 400;
   KZ_LONG yoe = y - era * 400;
   KZ_LONG mp  = (m + 9) % 12;
   KZ_LONG doy = (153 * mp + 2) / 5 + d - 1;
   KZ_LONG doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
   return era * 146097 + doe - 719468;
}

void KzCivilFromDays(KZ_LONG z, int &y, int &m, int &d)
{
   z += 719468;
   KZ_LONG era = (z >= 0 ? z : z - 146096) / 146097;
   KZ_LONG doe = z - era * 146097;
   KZ_LONG yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
   KZ_LONG yy  = yoe + era * 400;
   KZ_LONG doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
   KZ_LONG mp  = (5 * doy + 2) / 153;
   d = (int)(doy - (153 * mp + 2) / 5 + 1);
   m = (int)(mp < 10 ? mp + 3 : mp - 9);
   y = (int)(yy + (m <= 2 ? 1 : 0));
}

//--- weekday of a day number: 0=Mon .. 6=Sun
int KzWeekdayOfDay(const KZ_LONG dayNo) { return (int)((dayNo + 3) % 7); }

//--- day number of the n-th Sunday (n>=1) of a month
KZ_LONG KzNthSundayDay(const int year, const int month, const int n)
{
   KZ_LONG first = KzDaysFromCivil(year, month, 1);
   int wd  = KzWeekdayOfDay(first);
   int off = (6 - wd + 7) % 7;
   return first + off + 7 * (n - 1);
}

//--- day number of the last Sunday of a month
KZ_LONG KzLastSundayDay(const int year, const int month)
{
   int ny = year, nm = month + 1;
   if(nm > 12) { nm = 1; ny++; }
   KZ_LONG lastDay = KzDaysFromCivil(ny, nm, 1) - 1;
   int wd   = KzWeekdayOfDay(lastDay);
   int back = (wd - 6 + 7) % 7;
   return lastDay - back;
}

//--- US DST: 2nd Sunday of March 02:00 EST (07:00 UTC) .. 1st Sunday of November 02:00 EDT (06:00 UTC)
bool KzDstUS(const KZ_LONG utc)
{
   int y, m, d;
   KzCivilFromDays(utc / 86400, y, m, d);
   KZ_LONG s = KzNthSundayDay(y, 3, 2) * 86400 + 7 * 3600;
   KZ_LONG e = KzNthSundayDay(y, 11, 1) * 86400 + 6 * 3600;
   return (utc >= s && utc < e);
}

//--- EU DST: last Sunday of March 01:00 UTC .. last Sunday of October 01:00 UTC
bool KzDstEU(const KZ_LONG utc)
{
   int y, m, d;
   KzCivilFromDays(utc / 86400, y, m, d);
   KZ_LONG s = KzLastSundayDay(y, 3) * 86400 + 3600;
   KZ_LONG e = KzLastSundayDay(y, 10) * 86400 + 3600;
   return (utc >= s && utc < e);
}

//--- seconds to add to UTC to get the local clock time of a market clock
int KzClockOffset(const KZ_LONG utc, const int clock)
{
   switch(clock)
   {
      case KZ_CLK_NY:  return KzDstUS(utc) ? -4 * 3600 : -5 * 3600;
      case KZ_CLK_LON: return KzDstEU(utc) ?  1 * 3600 :  0;
      case KZ_CLK_FRA: return KzDstEU(utc) ?  2 * 3600 :  1 * 3600;
      case KZ_CLK_TYO: return 9 * 3600;
      default:         return 0;
   }
}

KZ_LONG KzLocalDay(const KZ_LONG utc, const int clock)
{
   return (utc + KzClockOffset(utc, clock)) / 86400;
}

int KzLocalMinute(const KZ_LONG utc, const int clock)
{
   KZ_LONG lt = utc + KzClockOffset(utc, clock);
   return (int)((lt % 86400) / 60);
}

int KzLocalWeekday(const KZ_LONG utc, const int clock)
{
   return KzWeekdayOfDay(KzLocalDay(utc, clock));
}

//--- trading ("session") day id: the day rolls at 17:00 New York time (FX / CME convention)
KZ_LONG KzSessionDay(const KZ_LONG utc)
{
   return (utc + KzClockOffset(utc, KZ_CLK_NY) + 7 * 3600) / 86400;
}

//--- broker server time -> UTC ------------------------------------------------
//  NYCLOSE : server = New York + 7h  (GMT+2 in winter, GMT+3 in summer, following US DST)
//  EUDST   : server = UTC+2 winter / UTC+3 summer following EU DST
//  FIXED   : server = UTC + fixedSec
KZ_LONG KzServerToUtc(const KZ_LONG srv, const int mode, const int fixedSec)
{
   if(mode == KZ_SRV_FIXED) return srv - fixedSec;
   if(mode == KZ_SRV_EUDST) return srv - (KzDstEU(srv - 2 * 3600) ? 3 * 3600 : 2 * 3600);
   return srv - (KzDstUS(srv - 2 * 3600) ? 3 * 3600 : 2 * 3600);
}

KZ_LONG KzUtcToServer(const KZ_LONG utc, const int mode, const int fixedSec)
{
   if(mode == KZ_SRV_FIXED) return utc + fixedSec;
   if(mode == KZ_SRV_EUDST) return utc + (KzDstEU(utc) ? 3 * 3600 : 2 * 3600);
   return utc + (KzDstUS(utc) ? 3 * 3600 : 2 * 3600);
}

//--- first "flat time" (New York minute-of-day) strictly after te (matches the research prototype)
KZ_LONG KzNextFlat(const KZ_LONG te, const int flatMin)
{
   int off = KzClockOffset(te, KZ_CLK_NY);
   KZ_LONG lt = te + off;
   int m = (int)((lt % 86400) / 60);
   int delta = (m < flatMin) ? (flatMin - m) * 60 : (flatMin + 1440 - m) * 60;
   return te + delta - (te % 60);
}

#endif
