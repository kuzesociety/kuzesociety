// mql5_shim.h - a small mock of the MetaTrader 5 runtime, just big enough to (1) COMPILE the EA and its
// broker-facing include as C++ (catching typos, wrong argument counts/types, undeclared names) and
// (2) DRY-RUN the whole EA against historical bars with a bar-driven mock broker.
// It is a test tool, not a simulator of MT5 execution: the real acceptance test is the MT5 Strategy Tester.
#pragma once
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cmath>
#include <cstdint>
#include <string>
#include <vector>
#include <map>
#include <algorithm>
#include <cstdarg>
#include <type_traits>
#include <sstream>
#include "../../MQL5/Include/KuzeEdge/KzTypes.mqh"

typedef std::string string;
typedef unsigned short ushort;

// ---- dynamic arrays (MQL5 `T name[]`) ----------------------------------------------------
template<class T> struct MqlArr {
   std::vector<T> v; bool series = false;
   T& operator[](int i) { return v[i]; }
   const T& operator[](int i) const { return v[i]; }
};
template<class T> int ArraySize(const MqlArr<T>& a) { return (int)a.v.size(); }
template<class T> int ArrayResize(MqlArr<T>& a, int n) { a.v.resize(n); return n; }
template<class T> bool ArraySetAsSeries(MqlArr<T>& a, bool f) { a.series = f; return true; }
template<class T> void ZeroMemory(T& x) { std::memset((void*)&x, 0, sizeof(T)); }

// ---- enums / constants ----------------------------------------------------------------------
enum ENUM_TIMEFRAMES { PERIOD_CURRENT=0, PERIOD_M1=1, PERIOD_M5=5, PERIOD_M15=15, PERIOD_M30=30, PERIOD_H1=60 };
enum ENUM_ORDER_TYPE { ORDER_TYPE_BUY=0, ORDER_TYPE_SELL=1 };
enum ENUM_ORDER_TYPE_FILLING { ORDER_FILLING_FOK=0, ORDER_FILLING_IOC=1, ORDER_FILLING_RETURN=2 };
enum ENUM_SYMBOL_INFO_DOUBLE { SYMBOL_BID, SYMBOL_ASK, SYMBOL_POINT, SYMBOL_TRADE_TICK_SIZE, SYMBOL_TRADE_TICK_VALUE, SYMBOL_TRADE_TICK_VALUE_LOSS,
   SYMBOL_TRADE_TICK_VALUE_PROFIT, SYMBOL_VOLUME_MIN, SYMBOL_VOLUME_MAX, SYMBOL_VOLUME_STEP, SYMBOL_TRADE_CONTRACT_SIZE };
enum ENUM_SYMBOL_INFO_INTEGER { SYMBOL_DIGITS, SYMBOL_SPREAD, SYMBOL_TRADE_STOPS_LEVEL, SYMBOL_TRADE_FREEZE_LEVEL, SYMBOL_TRADE_MODE, SYMBOL_FILLING_MODE };
enum ENUM_ACCOUNT_INFO_DOUBLE { ACCOUNT_BALANCE, ACCOUNT_EQUITY, ACCOUNT_MARGIN_FREE };
enum ENUM_POSITION_PROPERTY_INTEGER { POSITION_TICKET, POSITION_TIME, POSITION_TYPE, POSITION_MAGIC, POSITION_IDENTIFIER };
enum ENUM_POSITION_PROPERTY_DOUBLE { POSITION_VOLUME, POSITION_PRICE_OPEN, POSITION_SL, POSITION_TP, POSITION_PROFIT };
enum ENUM_POSITION_PROPERTY_STRING { POSITION_SYMBOL, POSITION_COMMENT };
enum ENUM_DEAL_PROPERTY_DOUBLE { DEAL_PROFIT, DEAL_SWAP, DEAL_COMMISSION };
enum ENUM_STATISTICS { STAT_TRADES, STAT_RECOVERY_FACTOR, STAT_PROFIT };
enum { POSITION_TYPE_BUY = 0, POSITION_TYPE_SELL = 1 };
enum { SYMBOL_TRADE_MODE_FULL = 4 };
enum { SYMBOL_FILLING_FOK = 1, SYMBOL_FILLING_IOC = 2 };
enum { TERMINAL_TRADE_ALLOWED = 1, MQL_TRADE_ALLOWED = 2, TERMINAL_COMMONDATA_PATH = 3 };
enum { TIME_DATE = 1, TIME_MINUTES = 2, TIME_SECONDS = 4 };
enum { FILE_READ = 1, FILE_WRITE = 2, FILE_TXT = 4, FILE_ANSI = 8, FILE_SHARE_READ = 16, FILE_SHARE_WRITE = 32, FILE_COMMON = 64, FILE_CSV = 128 };
enum { INIT_SUCCEEDED = 0, INIT_FAILED = 1, INIT_PARAMETERS_INCORRECT = 2 };
#define INVALID_HANDLE (-1)
enum { TRADE_RETCODE_DONE = 10009, TRADE_RETCODE_DONE_PARTIAL = 10010, TRADE_RETCODE_INVALID_STOPS = 10016, TRADE_RETCODE_NO_MONEY = 10019, TRADE_RETCODE_INVALID_VOLUME = 10014 };
typedef unsigned int uint;

struct MqlRates { long long time; double open, high, low, close; long long tick_volume; int spread; long long real_volume; };

// ---- string / formatting ------------------------------------------------------------------------
inline std::string IntegerToString(long long v, int = 0, unsigned short = ' ') { return std::to_string(v); }
inline std::string DoubleToString(double v, int d = 8) { char b[64]; snprintf(b, sizeof b, "%.*f", d, v); return b; }
inline int StringLen(const std::string& s) { return (int)s.size(); }
inline std::string StringSubstr(const std::string& s, int st, int len = -1) { if(st >= (int)s.size()) return ""; return len < 0 ? s.substr(st) : s.substr(st, len); }
inline int StringFind(const std::string& s, const std::string& t, int st = 0) { size_t p = s.find(t, st); return p == std::string::npos ? -1 : (int)p; }
inline bool StringToUpper(std::string& s) { for(auto& c : s) c = (char)toupper((unsigned char)c); return true; }
inline int StringTrimLeft(std::string& s) { size_t p = s.find_first_not_of(" \t\r\n"); s = (p == std::string::npos) ? "" : s.substr(p); return 0; }
inline int StringTrimRight(std::string& s) { size_t p = s.find_last_not_of(" \t\r\n"); s = (p == std::string::npos) ? "" : s.substr(0, p + 1); return 0; }
inline long long StringToInteger(const std::string& s) { return atoll(s.c_str()); }
inline int StringSplit(const std::string& s, unsigned short sep, MqlArr<std::string>& out) {
   out.v.clear(); size_t st = 0;
   for(size_t i = 0; i <= s.size(); i++) if(i == s.size() || s[i] == (char)sep) { out.v.push_back(s.substr(st, i - st)); st = i + 1; }
   return (int)out.v.size(); }
template<class T> inline auto kz_arg(const T& v) -> typename std::enable_if<!std::is_same<T, std::string>::value && !std::is_same<T, unsigned long>::value && !std::is_same<T, long>::value, const T&>::type { return v; }
inline const char* kz_arg(const std::string& v) { return v.c_str(); }
inline unsigned long long kz_arg(const unsigned long& v) { return v; }
inline long long kz_arg(const long& v) { return v; }
inline std::string kz_fixfmt(std::string f) {
   for(const char* pat : {"%I64u", "%I64d"}) { size_t p; while((p = f.find(pat)) != std::string::npos) f.replace(p, 5, pat[4] == 'u' ? "%llu" : "%lld"); }
   return f; }
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wformat-security"
#pragma GCC diagnostic ignored "-Wformat-nonliteral"
template<class... A> std::string StringFormat(const std::string& fmt, const A&... a) {
   std::string f = kz_fixfmt(fmt); char buf[4096];
   snprintf(buf, sizeof buf, f.c_str(), kz_arg(a)...); return buf; }
#pragma GCC diagnostic pop
template<class T> inline typename std::enable_if<std::is_arithmetic<T>::value, std::string>::type kz_s(const T& v) {
   if(std::is_floating_point<T>::value) { return DoubleToString((double)v, 5); }
   return std::to_string((long long)v); }
inline std::string kz_s(const std::string& s) { return s; }
inline std::string kz_s(const char* s) { return s; }
extern int g_shimVerbose;
template<class... A> void Print(const A&... a) { if(!g_shimVerbose) return; std::string s; int dummy[] = { 0, (s += kz_s(a), 0)... }; (void)dummy; fprintf(stderr, "%s\n", s.c_str()); }
inline void Comment(const std::string& s) { extern std::string g_shimComment; g_shimComment = s; }

// ---- math ---------------------------------------------------------------------------------------------
inline double MathSqrt(double x) { return std::sqrt(x); }
inline double MathFloor(double x) { return std::floor(x); }
inline double MathAbs(double x) { return std::fabs(x); }
inline double MathMax(double a, double b) { return a > b ? a : b; }
inline double MathMin(double a, double b) { return a < b ? a : b; }
inline double NormalizeDouble(double v, int d) { double p = std::pow(10.0, d); return std::round(v * p) / p; }

// ---- mock environment ------------------------------------------------------------------------------
struct MockSym { double point = 0.01; int digits = 2; double tickSize = 0.01, tickValue = 0.01, minLot = 0.01, maxLot = 100, lotStep = 0.01, contract = 1.0;
                 int stopsLevel = 0, freezeLevel = 0; };
struct MockPos { ulong ticket; long long id; int dir; double lots, open, sl, tp; long long tOpen; long long magic; std::string sym, comment; };
struct MockDeal { ulong ticket; long long posId; double profit, swap, commission; int entry; long long time; double price; };
struct MockEnv {
   std::string symbol = "TEST"; ENUM_TIMEFRAMES period = PERIOD_M5;
   std::vector<MqlRates> bars; int cur = 0;         // bars[cur] = currently forming bar (server time)
   long long timeCurrent = 0; double bid = 0, ask = 0;
   MockSym sym; double balance = 10000.0; std::vector<MockPos> pos; std::vector<MockDeal> deals; ulong nextTicket = 1000;
   std::map<std::string, double> gv; std::string comment; unsigned retcode = 0; ulong lastOrder = 0; double leverage = 100.0;
   std::vector<long long> selDeals; int selPos = -1; std::string filesDir = "/tmp/kz_mock_files"; std::map<int, FILE*> files; int nextHandle = 1;
   bool tradeAllowed = true; std::vector<std::string> closedLog;
   double floating() const;
};
extern MockEnv g_env;
#define _Symbol (g_env.symbol)
#define _Point  (g_env.sym.point)
#define _Digits (g_env.sym.digits)
#define _Period (g_env.period)

inline long long TimeCurrent() { return g_env.timeCurrent; }
inline long long iTime(const std::string&, ENUM_TIMEFRAMES, int shift) { int i = g_env.cur - shift; return (i >= 0 && i < (int)g_env.bars.size()) ? g_env.bars[i].time : 0; }
inline int PeriodSeconds(ENUM_TIMEFRAMES p = PERIOD_CURRENT) { int m = (p == PERIOD_CURRENT) ? (int)g_env.period : (int)p; return m * 60; }
inline int Bars(const std::string&, ENUM_TIMEFRAMES) { return g_env.cur + 1; }
inline int CopyRates(const std::string&, ENUM_TIMEFRAMES, int start_pos, int count, MqlArr<MqlRates>& arr) {
   int newest = g_env.cur - start_pos; if(newest < 0) return 0;
   int oldest = newest - count + 1; if(oldest < 0) oldest = 0;
   int n = newest - oldest + 1; arr.v.assign(g_env.bars.begin() + oldest, g_env.bars.begin() + newest + 1);
   if(arr.series) std::reverse(arr.v.begin(), arr.v.end());
   return n; }
inline bool SymbolSelect(const std::string&, bool) { return true; }
inline double SymbolInfoDouble(const std::string&, ENUM_SYMBOL_INFO_DOUBLE p) {
   switch(p) {
      case SYMBOL_BID: return g_env.bid; case SYMBOL_ASK: return g_env.ask; case SYMBOL_POINT: return g_env.sym.point;
      case SYMBOL_TRADE_TICK_SIZE: return g_env.sym.tickSize; case SYMBOL_TRADE_TICK_VALUE: case SYMBOL_TRADE_TICK_VALUE_LOSS: case SYMBOL_TRADE_TICK_VALUE_PROFIT: return g_env.sym.tickValue;
      case SYMBOL_VOLUME_MIN: return g_env.sym.minLot; case SYMBOL_VOLUME_MAX: return g_env.sym.maxLot; case SYMBOL_VOLUME_STEP: return g_env.sym.lotStep;
      case SYMBOL_TRADE_CONTRACT_SIZE: return g_env.sym.contract; }
   return 0; }
inline long long SymbolInfoInteger(const std::string&, ENUM_SYMBOL_INFO_INTEGER p) {
   switch(p) {
      case SYMBOL_DIGITS: return g_env.sym.digits; case SYMBOL_SPREAD: return g_env.bars.empty() ? 0 : g_env.bars[g_env.cur].spread;
      case SYMBOL_TRADE_STOPS_LEVEL: return g_env.sym.stopsLevel; case SYMBOL_TRADE_FREEZE_LEVEL: return g_env.sym.freezeLevel;
      case SYMBOL_TRADE_MODE: return SYMBOL_TRADE_MODE_FULL; case SYMBOL_FILLING_MODE: return SYMBOL_FILLING_IOC | SYMBOL_FILLING_FOK; }
   return 0; }
inline long long TerminalInfoInteger(int) { return g_env.tradeAllowed ? 1 : 0; }
inline std::string TerminalInfoString(int) { return g_env.filesDir; }
inline long long MQLInfoInteger(int) { return g_env.tradeAllowed ? 1 : 0; }
inline double MockEnv::floating() const {
   double f = 0; for(auto& p : pos) { double px = p.dir > 0 ? bid : ask; f += (px - p.open) * p.dir * p.lots * sym.tickValue / sym.tickSize; } return f; }
inline double AccountInfoDouble(ENUM_ACCOUNT_INFO_DOUBLE p) {
   double eq = g_env.balance + g_env.floating();
   switch(p) { case ACCOUNT_BALANCE: return g_env.balance; case ACCOUNT_EQUITY: return eq; case ACCOUNT_MARGIN_FREE: {
      double used = 0; for(auto& q : g_env.pos) used += q.lots * g_env.sym.contract * q.open / g_env.leverage; return eq - used; } }
   return 0; }
inline bool OrderCalcMargin(ENUM_ORDER_TYPE, const std::string&, double vol, double price, double& margin) { margin = vol * g_env.sym.contract * price / g_env.leverage; return true; }

// ---- positions & history -------------------------------------------------------------------------------
inline int PositionsTotal() { return (int)g_env.pos.size(); }
inline ulong PositionGetTicket(int i) { if(i < 0 || i >= (int)g_env.pos.size()) return 0; g_env.selPos = i; return g_env.pos[i].ticket; }
inline bool PositionSelectByTicket(ulong t) { for(int i = 0; i < (int)g_env.pos.size(); i++) if(g_env.pos[i].ticket == t) { g_env.selPos = i; return true; } return false; }
inline long long PositionGetInteger(ENUM_POSITION_PROPERTY_INTEGER p) {
   auto& q = g_env.pos[g_env.selPos];
   switch(p) { case POSITION_TICKET: return (long long)q.ticket; case POSITION_TIME: return q.tOpen; case POSITION_TYPE: return q.dir > 0 ? POSITION_TYPE_BUY : POSITION_TYPE_SELL;
      case POSITION_MAGIC: return q.magic; case POSITION_IDENTIFIER: return q.id; } return 0; }
inline double PositionGetDouble(ENUM_POSITION_PROPERTY_DOUBLE p) {
   auto& q = g_env.pos[g_env.selPos];
   switch(p) { case POSITION_VOLUME: return q.lots; case POSITION_PRICE_OPEN: return q.open; case POSITION_SL: return q.sl; case POSITION_TP: return q.tp; case POSITION_PROFIT: return 0; } return 0; }
inline std::string PositionGetString(ENUM_POSITION_PROPERTY_STRING p) { auto& q = g_env.pos[g_env.selPos]; return p == POSITION_SYMBOL ? q.sym : q.comment; }
inline bool HistorySelectByPosition(long long id) { g_env.selDeals.clear(); for(auto& d : g_env.deals) if(d.posId == id) g_env.selDeals.push_back((long long)d.ticket); return true; }
inline int HistoryDealsTotal() { return (int)g_env.selDeals.size(); }
inline ulong HistoryDealGetTicket(int i) { return (i >= 0 && i < (int)g_env.selDeals.size()) ? (ulong)g_env.selDeals[i] : 0; }
inline double HistoryDealGetDouble(ulong t, ENUM_DEAL_PROPERTY_DOUBLE p) {
   for(auto& d : g_env.deals) { if(d.ticket == t) { return p == DEAL_PROFIT ? d.profit : (p == DEAL_SWAP ? d.swap : d.commission); } }
   return 0; }

// ---- CTrade -----------------------------------------------------------------------------------------------------
struct MockOps { static void closePos(int idx, double px, long long t); };
inline void MockOps::closePos(int idx, double px, long long t) {
   MockPos p = g_env.pos[idx];
   double profit = (px - p.open) * p.dir * p.lots * g_env.sym.tickValue / g_env.sym.tickSize;
   g_env.balance += profit;
   g_env.deals.push_back({ g_env.nextTicket++, p.id, profit, 0.0, 0.0, 1, t, px });
   char b[256]; snprintf(b, sizeof b, "%lld,%lld,%d,%.5f,%.5f,%.2f,%.4f,%.5f,%.5f", p.tOpen, t, p.dir, p.open, px, p.lots, profit, p.sl, p.tp);
   g_env.closedLog.push_back(b);
   g_env.pos.erase(g_env.pos.begin() + idx);
}
class CTrade {
   ulong m_magic = 0; ulong m_dev = 0; unsigned m_ret = 0; std::string m_cmt;
   bool open(int dir, double vol, double sl, double tp, const std::string& cmt) {
      const MockSym& s = g_env.sym;
      if(vol < s.minLot - 1e-9 || vol > s.maxLot + 1e-9 || std::fabs(vol / s.lotStep - std::round(vol / s.lotStep)) > 1e-6) { m_ret = TRADE_RETCODE_INVALID_VOLUME; return false; }
      double px = dir > 0 ? g_env.ask : g_env.bid; double md = s.stopsLevel * s.point;
      double ref = dir > 0 ? g_env.bid : g_env.ask;
      if(sl > 0 && (dir > 0 ? sl > ref - md : sl < ref + md)) { m_ret = TRADE_RETCODE_INVALID_STOPS; return false; }
      if(tp > 0 && (dir > 0 ? tp < ref + md : tp > ref - md)) { m_ret = TRADE_RETCODE_INVALID_STOPS; return false; }
      double margin = vol * s.contract * px / g_env.leverage;
      if(margin > AccountInfoDouble(ACCOUNT_MARGIN_FREE)) { m_ret = TRADE_RETCODE_NO_MONEY; return false; }
      MockPos p{ g_env.nextTicket, (long long)g_env.nextTicket, dir, vol, px, sl, tp, g_env.timeCurrent, (long long)m_magic, g_env.symbol, cmt };
      g_env.nextTicket++; g_env.pos.push_back(p); m_ret = TRADE_RETCODE_DONE; return true; }
public:
   void SetExpertMagicNumber(ulong m) { m_magic = m; }
   void SetDeviationInPoints(ulong d) { m_dev = d; }
   void SetTypeFilling(ENUM_ORDER_TYPE_FILLING) {}
   void SetAsyncMode(bool) {}
   bool Buy(double vol, const std::string& = "", double = 0.0, double sl = 0.0, double tp = 0.0, const std::string& c = "") { return open(1, vol, sl, tp, c); }
   bool Sell(double vol, const std::string& = "", double = 0.0, double sl = 0.0, double tp = 0.0, const std::string& c = "") { return open(-1, vol, sl, tp, c); }
   bool PositionClose(ulong ticket, ulong = 0) {
      for(int i = 0; i < (int)g_env.pos.size(); i++) if(g_env.pos[i].ticket == ticket) { double px = g_env.pos[i].dir > 0 ? g_env.bid : g_env.ask; MockOps::closePos(i, px, g_env.timeCurrent); m_ret = TRADE_RETCODE_DONE; return true; }
      m_ret = 10013; return false; }
   unsigned ResultRetcode() const { return m_ret; }
   std::string ResultRetcodeDescription() const { return "retcode " + std::to_string(m_ret); }
};

// ---- misc ------------------------------------------------------------------------------------------------------------
inline std::string TimeToString(long long t, int = 0) {
   time_t tt = (time_t)t; struct tm g; gmtime_r(&tt, &g); char b[64]; strftime(b, sizeof b, "%Y.%m.%d %H:%M:%S", &g); return b; }
inline bool GlobalVariableCheck(const std::string& n) { return g_env.gv.count(n) > 0; }
inline double GlobalVariableGet(const std::string& n) { return g_env.gv[n]; }
inline long long GlobalVariableSet(const std::string& n, double v) { g_env.gv[n] = v; return 0; }
inline double TesterStatistics(ENUM_STATISTICS) { return 0.0; }
inline bool FolderCreate(const std::string& name, int = 0) { std::string path = g_env.filesDir + "/" + name; std::string cmd = "mkdir -p '" + path + "'"; return system(cmd.c_str()) == 0; }
inline int FileOpen(const std::string& name, int flags) {
   std::string path = g_env.filesDir + "/" + name; for(auto& c : path) if(c == '\\') c = '/';
   size_t sl = path.rfind('/'); if(sl != std::string::npos) { std::string cmd = "mkdir -p '" + path.substr(0, sl) + "'"; if(system(cmd.c_str())) {} }
   FILE* f = fopen(path.c_str(), (flags & FILE_WRITE) ? "a+" : "r"); if(!f) return INVALID_HANDLE;
   int h = g_env.nextHandle++; g_env.files[h] = f; return h; }
inline unsigned long long FileSize(int h) { FILE* f = g_env.files[h]; long p = ftell(f); fseek(f, 0, SEEK_END); long s = ftell(f); fseek(f, p, SEEK_SET); return (unsigned long long)s; }
inline bool FileSeek(int h, long long off, int origin) { return fseek(g_env.files[h], (long)off, origin == SEEK_END ? SEEK_END : (origin == 1 ? SEEK_CUR : SEEK_SET)) == 0; }
inline unsigned FileWriteString(int h, const std::string& s, int = -1) { fputs(s.c_str(), g_env.files[h]); return (unsigned)s.size(); }
inline void FileClose(int h) { fclose(g_env.files[h]); g_env.files.erase(h); }
