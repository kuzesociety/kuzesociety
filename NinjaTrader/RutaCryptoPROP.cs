// ════════════════════════════════════════════════════════════════════════════
//  RutaCrypto PROP — NinjaTrader 8 strategy
//  Port of RutaCrypto_PROP.pine (TradingView). Same rules, same default settings.
//
//  Install: copy this file to  Documents\NinjaTrader 8\bin\Custom\Strategies\
//           then open New → NinjaScript Editor and press F5 to compile.
//  Chart:   MNQ (front month), 1 Minute, trading hours "CME US Index Futures ETH".
//
//  Differences from TradingView that cannot be removed (see README):
//  • Market orders fill at the NEXT bar's open (TradingView fills at the close).
//  • Reversals close first, then enter as soon as the position is flat.
//  • Break-even / trailing stops move at bar close (TradingView trails intrabar).
//  • Data feeds differ slightly, so a few RSI crosses can differ.
// ════════════════════════════════════════════════════════════════════════════

#region Using declarations
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Xml.Serialization;
using NinjaTrader.Cbi;
using NinjaTrader.Gui;
using NinjaTrader.Gui.Chart;
using NinjaTrader.Gui.SuperDom;
using NinjaTrader.Gui.Tools;
using NinjaTrader.Data;
using NinjaTrader.NinjaScript;
using NinjaTrader.Core.FloatingPoint;
using NinjaTrader.NinjaScript.Indicators;
using NinjaTrader.NinjaScript.DrawingTools;
using RutaCryptoProp;
#endregion

namespace RutaCryptoProp
{
    public enum SizingMode     { AtrStopAutoContracts, FixedDollarFixedContracts }
    public enum SignalPreset   { Active, Strict, Custom }
    public enum DrawdownType   { EndOfDay, Intraday }
    public enum WhenBlown      { StartNewAccount, StopTrading }
    public enum TradeDirection { Both, LongOnly, ShortOnly }
    public enum OppositeSignal { Reverse, Close, Ignore }
    public enum PriceSource    { Close, Open, High, Low, HL2, HLC3, OHLC4 }

    // ─── Pine Script indicator math, reproduced exactly ─────────────────────
    // (NinjaTrader's built-in RSI / EMA / ATR start up differently, so they are
    //  not used; these match TradingView's ta.rma / ta.ema / ta.sma.)

    /// <summary>Pine ta.rma: SMA of the first n values, then Wilder smoothing.</summary>
    public sealed class PineRma
    {
        private readonly int n;
        private int count;
        private double sum;
        public double Value = double.NaN;
        public PineRma(int length) { n = Math.Max(1, length); }
        public double Update(double x)
        {
            if (double.IsNaN(x)) return Value;
            if (count < n)
            {
                sum += x;
                count++;
                if (count == n) Value = sum / n;
                return Value;
            }
            Value = (x + (n - 1) * Value) / n;
            return Value;
        }
    }

    /// <summary>Pine ta.ema: SMA of the first n values, then alpha = 2 / (n + 1).</summary>
    public sealed class PineEma
    {
        private readonly int n;
        private readonly double alpha;
        private int count;
        private double sum;
        public double Value = double.NaN;
        public PineEma(int length) { n = Math.Max(1, length); alpha = 2.0 / (n + 1); }
        public double Update(double x)
        {
            if (double.IsNaN(x)) return Value;
            if (count < n)
            {
                sum += x;
                count++;
                if (count == n) Value = sum / n;
                return Value;
            }
            Value = alpha * x + (1 - alpha) * Value;
            return Value;
        }
    }

    /// <summary>Pine ta.sma over the last n values.</summary>
    public sealed class PineSma
    {
        private readonly double[] buf;
        private int count, head;
        public double Value = double.NaN;
        public PineSma(int length) { buf = new double[Math.Max(1, length)]; }
        public double Update(double x)
        {
            buf[head] = x;
            head = (head + 1) % buf.Length;
            if (count < buf.Length) count++;
            if (count < buf.Length) return Value;
            double s = 0;
            for (int i = 0; i < buf.Length; i++) s += buf[i];
            Value = s / buf.Length;
            return Value;
        }
    }

    /// <summary>The signal logic of RutaCrypto_PROP.pine, bar by bar.</summary>
    public sealed class SignalEngine
    {
        public double RsiLower = 30, RsiUpper = 70, VolLevel = -39, AdxMin = 18;
        public int Memory = 2;
        public bool UseHA = true, UseVwap, UseHtf, UseAdx;
        public TradeDirection Direction = TradeDirection.Both;

        private readonly PineRma rsiUp, rsiDn, atr, dmTr, dmPlus, dmMinus, adxRma;
        private readonly PineEma volFast, volSlow;
        private readonly PineSma trend;
        private int bar = -1;
        private double prevSrc = double.NaN, prevClose = double.NaN, prevHigh = double.NaN, prevLow = double.NaN;
        private double haOpenPrev, haClosePrev, plusFix = double.NaN, minusFix = double.NaN, cumPV, cumV;

        public double Rsi = double.NaN, PrevRsi = double.NaN, Atr = double.NaN, VolOsc, Trend = double.NaN;
        public double HaOpen, HaClose, Vwap = double.NaN, Adx = double.NaN;
        public bool RsiUpX, RsiDnX, LongSignal, ShortSignal;
        // bar of the latest RSI cross, and of the last cross already used for a trade (-1 = none)
        public int UpXBar = -1, DnXBar = -1, UsedUpX = -1, UsedDnX = -1;
        public int Bar { get { return bar; } }

        public SignalEngine(int rsiLen, int atrLen, int volFastLen, int volSlowLen, int trendLen, int adxLen)
        {
            rsiUp = new PineRma(rsiLen); rsiDn = new PineRma(rsiLen); atr = new PineRma(atrLen);
            dmTr = new PineRma(adxLen); dmPlus = new PineRma(adxLen); dmMinus = new PineRma(adxLen); adxRma = new PineRma(adxLen);
            volFast = new PineEma(volFastLen); volSlow = new PineEma(volSlowLen);
            trend = new PineSma(trendLen);
        }

        public void Update(double o, double h, double l, double c, double v, double src, bool newSession, double htfEma)
        {
            bar++;

            // Heikin-Ashi (same values as a Heikin-Ashi chart)
            double haC = (o + h + l + c) / 4.0;
            double haO = bar == 0 ? (o + c) / 2.0 : (haOpenPrev + haClosePrev) / 2.0;
            haOpenPrev = haO; haClosePrev = haC; HaOpen = haO; HaClose = haC;

            // RSI (Pine ta.rsi)
            PrevRsi = Rsi;
            if (!double.IsNaN(prevSrc))
            {
                double ch = src - prevSrc;
                double up = rsiUp.Update(Math.Max(ch, 0.0));
                double dn = rsiDn.Update(Math.Max(-ch, 0.0));
                if (!double.IsNaN(up) && !double.IsNaN(dn))
                    Rsi = dn == 0 ? 100.0 : up == 0 ? 0.0 : 100.0 - 100.0 / (1.0 + up / dn);
            }
            prevSrc = src;

            // ATR (Pine ta.atr: the first true range is high - low)
            double tr = double.IsNaN(prevClose) ? h - l : Math.Max(h - l, Math.Max(Math.Abs(h - prevClose), Math.Abs(l - prevClose)));
            Atr = atr.Update(tr);

            // Volume oscillator, trend SMA
            double vf = volFast.Update(v), vs = volSlow.Update(v);
            VolOsc = vs > 0 ? 100.0 * (vf - vs) / vs : 0.0;
            Trend = trend.Update(c);

            // Session VWAP (Pine ta.vwap(hlc3))
            if (newSession || bar == 0) { cumPV = 0; cumV = 0; }
            cumPV += (h + l + c) / 3.0 * v;
            cumV += v;
            Vwap = cumV > 0 ? cumPV / cumV : double.NaN;

            // ADX (Pine ta.dmi)
            if (!double.IsNaN(prevHigh))
            {
                double upMove = h - prevHigh, downMove = prevLow - l;
                double plusDM = upMove > downMove && upMove > 0 ? upMove : 0.0;
                double minusDM = downMove > upMove && downMove > 0 ? downMove : 0.0;
                double trur = dmTr.Update(tr);
                double plus = 100.0 * dmPlus.Update(plusDM) / trur;
                double minus = 100.0 * dmMinus.Update(minusDM) / trur;
                if (!double.IsNaN(plus) && !double.IsInfinity(plus)) plusFix = plus;
                if (!double.IsNaN(minus) && !double.IsInfinity(minus)) minusFix = minus;
                double sum = plusFix + minusFix;
                if (!double.IsNaN(sum))
                    Adx = 100.0 * adxRma.Update(Math.Abs(plusFix - minusFix) / (sum == 0 ? 1.0 : sum));
            }
            prevClose = c; prevHigh = h; prevLow = l;

            // Signals: RSI cross (may be up to Memory bars old, each cross used once)
            RsiUpX = Rsi > RsiLower && PrevRsi <= RsiLower;
            RsiDnX = Rsi < RsiUpper && PrevRsi >= RsiUpper;
            if (RsiUpX) UpXBar = bar;
            if (RsiDnX) DnXBar = bar;
            bool rsiLong  = UpXBar >= 0 && bar - UpXBar <= Memory && UpXBar > UsedUpX;
            bool rsiShort = DnXBar >= 0 && bar - DnXBar <= Memory && DnXBar > UsedDnX;
            bool volOk = VolOsc > VolLevel;
            bool filtLong  = (!UseVwap || c > Vwap) && (!UseHtf || c > htfEma) && (!UseAdx || Adx >= AdxMin);
            bool filtShort = (!UseVwap || c < Vwap) && (!UseHtf || c < htfEma) && (!UseAdx || Adx >= AdxMin);
            LongSignal  = (!UseHA || haC > haO) && rsiLong  && volOk && c > Trend && filtLong  && Direction != TradeDirection.ShortOnly;
            ShortSignal = (!UseHA || haC < haO) && rsiShort && volOk && c < Trend && filtShort && Direction != TradeDirection.LongOnly;
        }
    }

    public struct TradePlan
    {
        public int Qty, StopTicks, TargetTicks;
    }

    /// <summary>The $ risk engine of RutaCrypto_PROP.pine: dollars → ticks → contracts.</summary>
    public static class RiskEngine
    {
        /// <summary>Pine math.round: halves round away from zero.</summary>
        public static int PineRound(double x)
        {
            if (double.IsNaN(x) || double.IsInfinity(x)) return 0;
            return (int)Math.Round(x, MidpointRounding.AwayFromZero);
        }

        public static int FloorInt(double x)
        {
            if (double.IsNaN(x)) return 0;
            if (x >= int.MaxValue) return int.MaxValue;
            if (x <= int.MinValue) return int.MinValue;
            return (int)Math.Floor(x);
        }

        /// <summary>Contracts, stop ticks and target ticks. Qty = 0 means no trade.
        /// Worst-case loss per contract = (stop + slippage) ticks × $/tick + round-trip fees.</summary>
        public static TradePlan Plan(SizingMode mode, double budget, double atr, double tickSize, double tickValue,
            double feeRT, int slipTicks, double maxLoss, double maxProfit, int fixedQty, int maxQty,
            double slMult, double tpMult, int minStopTicks)
        {
            TradePlan p = new TradePlan();
            if (mode == SizingMode.AtrStopAutoContracts)
            {
                if (double.IsNaN(atr)) return p;
                p.StopTicks = Math.Max(minStopTicks, PineRound(atr * slMult / tickSize));
                double perContract = (p.StopTicks + slipTicks) * tickValue + feeRT;
                p.Qty = Math.Min(maxQty, FloorInt(budget / perContract));
                if (p.Qty >= 1)
                    p.TargetTicks = Math.Min(PineRound(atr * tpMult / tickSize), FloorInt(maxProfit / (p.Qty * tickValue)));
            }
            else
            {
                // exact $ bracket for the chosen size; size is only cut if the day / account can't afford it
                p.StopTicks = FloorInt((maxLoss / fixedQty - feeRT) / tickValue) - slipTicks;
                p.TargetTicks = FloorInt(maxProfit / (fixedQty * tickValue));
                if (p.StopTicks >= 1)
                {
                    double perContract = (p.StopTicks + slipTicks) * tickValue + feeRT;
                    p.Qty = Math.Min(fixedQty, FloorInt(budget / perContract));
                }
            }
            if (p.StopTicks < 1 || p.TargetTicks < 1 || p.Qty < 1) p.Qty = 0;
            return p;
        }

        /// <summary>The most the next trade may lose: per-trade max, shrunk near the daily / drawdown limits.</summary>
        public static double Budget(double maxLoss, bool useDll, double dll, double dayPnl, bool useDd,
            double equity, double ddFloor, double buffer, out string source)
        {
            double b = maxLoss;
            source = "per-trade max";
            if (useDll && dll + dayPnl - buffer < b) { b = dll + dayPnl - buffer; source = "daily limit room"; }
            if (useDd && equity - ddFloor - buffer < b) { b = equity - ddFloor - buffer; source = "drawdown room"; }
            return b;
        }
    }
}

namespace NinjaTrader.NinjaScript.Strategies
{
    public class RutaCryptoPROP : Strategy
    {
        private const string LongSig = "Long", ShortSig = "Short";
        private const int GlobexOpenMin = 18 * 60;          // CME re-opens 18:00 NY = new trading day

        private SignalEngine eng;
        private PineEma htfEmaCalc;
        private double htfEma = double.NaN;
        private TimeZoneInfo nyTz;
        private bool liveMode;

        // day book-keeping
        private double dayRealized;
        private int dayEntries, dayWins, dayLosses, sessCount, totEntries, maxDayEnt;
        private bool dayHalted;
        private string dayHaltWhy = "";

        // closed trades
        private int seenTrades, lastExitBar = -1, closedCount, winCount, skipped;
        private double realizedTotal, worstTrade, bestTrade, grossWin, grossLoss;

        // trailing drawdown (prop-firm style)
        private double accStart, ddPeak, ddFloor;
        private bool ddBreached;
        private int accBlown;

        // current trade
        private int trSl, trTp, trTrailPts, trTrailOff;
        private double mfePx = double.NaN, stopPx = double.NaN;
        private bool beDone;

        // reversal: waits for the old position to close, then enters
        private int pendDir, pendBar;
        private TradePlan pendPlan;
        private double pendAtr;

        #region State
        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description = "RutaCrypto PROP: Heikin-Ashi + RSI + volume with a prop-firm risk engine. Port of RutaCrypto_PROP.pine.";
                Name = "RutaCryptoPROP";
                Calculate = Calculate.OnBarClose;
                EntriesPerDirection = 1;
                EntryHandling = EntryHandling.AllEntries;
                IsExitOnSessionCloseStrategy = true;
                ExitOnSessionCloseSeconds = 30;
                IsFillLimitOnTouch = false;
                MaximumBarsLookBack = MaximumBarsLookBack.TwoHundredFiftySix;
                OrderFillResolution = OrderFillResolution.Standard;
                Slippage = 1;
                StartBehavior = StartBehavior.WaitUntilFlat;
                TimeInForce = TimeInForce.Gtc;
                TraceOrders = false;
                RealtimeErrorHandling = RealtimeErrorHandling.StopCancelClose;
                StopTargetHandling = StopTargetHandling.ByStrategyPosition;
                BarsRequiredToTrade = 20;
                IncludeCommission = true;
                IsInstantiatedOnEachOptimizationIteration = true;

                // 1. Per-trade risk
                SizeMode = SizingMode.AtrStopAutoContracts;
                MaxLossPerTrade = 2000;
                MaxProfitPerTrade = 1500;
                FixedContracts = 10;
                MaxContracts = 50;
                AtrLength = 14;
                StopAtrMult = 2.0;
                TargetAtrMult = 4.0;
                MinStopTicks = 8;

                // 2. Account guard
                AccountSize = 150000;
                UseTrailingDrawdown = true;
                TrailingDrawdown = 5000;
                DrawdownMode = DrawdownType.EndOfDay;
                LockTrailing = true;
                LockOffset = 100;
                OnBlown = WhenBlown.StartNewAccount;
                LiveDrawdownFloor = 0;
                UseDailyLossLimit = false;
                DailyLossLimit = 3000;
                UseDailyGoal = false;
                DailyGoal = 3000;
                MaxTradesPerDay = 0;
                MaxLosersPerDay = 0;
                SafetyBuffer = 100;

                // 3. Session (New York time)
                UseEntryWindow = true;
                EntryStart = 930;
                EntryEnd = 1545;
                UseForceFlat = true;
                FlatTime = 1555;

                // 4. Signal
                Preset = SignalPreset.Active;
                UseHeikinAshi = true;
                RsiSource = PriceSource.Close;
                RsiLength = 12;
                CustomRsiLower = 20;
                CustomRsiUpper = 71;
                VolFastLength = 5;
                VolSlowLength = 14;
                VolThreshold = -39;
                TrendLength = 10;
                CustomSignalMemory = 0;

                // 5. Extra filters
                Direction = TradeDirection.Both;
                Opposite = OppositeSignal.Reverse;
                UseVwapFilter = false;
                UseHtfFilter = false;
                HtfMinutes = 60;
                HtfEmaLength = 50;
                UseAdxFilter = false;
                AdxMin = 18;
                AdxLength = 14;
                CooldownBars = 0;

                // 6. Trade management
                UseBreakEven = false;
                BreakEvenPct = 50;
                BreakEvenOffsetTicks = 2;
                UseTrailing = false;
                TrailStartPct = 60;
                TrailAtrMult = 1.0;

                // 7. Costs
                FeePerSide = 0.62;

                // 8. Display
                ShowDashboard = true;
                ShowTradeMarkers = true;
            }
            else if (State == State.Configure)
            {
                if (UseHtfFilter)
                    AddDataSeries(BarsPeriodType.Minute, HtfMinutes);
            }
            else if (State == State.DataLoaded)
            {
                eng = new SignalEngine(RsiLength, AtrLength, VolFastLength, VolSlowLength, TrendLength, AdxLength);
                eng.RsiLower = Preset == SignalPreset.Active ? 30.0 : Preset == SignalPreset.Strict ? 20.0 : CustomRsiLower;
                eng.RsiUpper = Preset == SignalPreset.Active ? 70.0 : Preset == SignalPreset.Strict ? 71.0 : CustomRsiUpper;
                eng.Memory   = Preset == SignalPreset.Active ? 2    : Preset == SignalPreset.Strict ? 0    : CustomSignalMemory;
                eng.UseHA = UseHeikinAshi;
                eng.VolLevel = VolThreshold;
                eng.UseVwap = UseVwapFilter;
                eng.UseHtf = UseHtfFilter;
                eng.UseAdx = UseAdxFilter;
                eng.AdxMin = AdxMin;
                eng.Direction = Direction;
                htfEmaCalc = new PineEma(HtfEmaLength);
                nyTz = TimeZoneInfo.FindSystemTimeZoneById("Eastern Standard Time");

                accStart = AccountSize;
                ddPeak = AccountSize;
                ddFloor = AccountSize - TrailingDrawdown;
            }
            else if (State == State.Realtime)
            {
                StartLive();
            }
        }

        /// <summary>Switching from the historical backtest to live trading: the simulated
        /// accounting is replaced by the real account.</summary>
        private void StartLive()
        {
            liveMode = true;
            double netLiq = AccountValue(AccountItem.NetLiquidation);
            double start = netLiq > 0 ? netLiq : AccountSize + realizedTotal;
            accStart = AccountSize;                          // lock level = account's starting balance
            ddPeak = start;
            ddFloor = LiveDrawdownFloor > 0 ? LiveDrawdownFloor : start - TrailingDrawdown;
            ddBreached = false;
            dayRealized = 0; dayEntries = 0; dayWins = 0; dayLosses = 0;
            dayHalted = false; dayHaltWhy = "";
            seenTrades = SystemPerformance.AllTrades.Count;  // ignore the historical (virtual) trades
            pendDir = 0;
            Print(string.Format("RutaCryptoPROP live on {0}: equity {1:N0}, drawdown floor {2:N0}", Account != null ? Account.Name : "?", start, ddFloor));
        }
        #endregion

        protected override void OnBarUpdate()
        {
            if (BarsInProgress == 1)
            {
                // higher-timeframe EMA: value as of the last completed HTF bar (non-repainting)
                htfEma = htfEmaCalc.Update(Closes[1][0]);
                return;
            }
            if (BarsInProgress != 0) return;

            bool newDay = Bars.IsFirstBarOfSession;
            eng.Update(Open[0], High[0], Low[0], Close[0], Volume[0], SourcePrice(), newDay, htfEma);
            if (pendDir != 0 && CurrentBar > pendBar + 1) pendDir = 0;   // reversal never completed

            // ─── Contract specs (from the instrument, so $ risk adapts to any contract) ──
            double tickSize = Instrument.MasterInstrument.TickSize;
            double pointVal = Instrument.MasterInstrument.PointValue;
            double tickValue = tickSize * pointVal;
            double feeRT = 2.0 * FeePerSide;

            // ─── Position ──────────────────────────────────────────────────
            bool inLong = Position.MarketPosition == MarketPosition.Long;
            bool inShort = Position.MarketPosition == MarketPosition.Short;
            bool inPos = inLong || inShort;
            int posQty = Position.Quantity;
            double avgPx = Position.AveragePrice;
            double openPnl = inPos ? Position.GetUnrealizedProfitLoss(PerformanceUnit.Currency, Close[0]) : 0.0;
            double openBest = inLong ? (High[0] - avgPx) * posQty * pointVal : inShort ? (avgPx - Low[0]) * posQty * pointVal : 0.0;
            double openWorst = inLong ? (Low[0] - avgPx) * posQty * pointVal : inShort ? (avgPx - High[0]) * posQty * pointVal : 0.0;
            openWorst = Math.Min(openWorst, openPnl);

            // ─── Daily book-keeping (trading day starts with the session) ───
            if (newDay)
            {
                sessCount++;
                dayRealized = 0; dayEntries = 0; dayWins = 0; dayLosses = 0;
                dayHalted = false; dayHaltWhy = "";
            }
            ProcessClosedTrades();

            double balance, equity;
            if (liveMode)
            {
                double cash = AccountValue(AccountItem.CashValue);
                double netLiq = AccountValue(AccountItem.NetLiquidation);
                balance = cash > 0 ? cash : AccountSize + realizedTotal;
                equity = netLiq > 0 ? netLiq : balance + openPnl;
            }
            else
            {
                balance = AccountSize + realizedTotal;
                equity = balance + openPnl;
            }
            double dayPnl = dayRealized + openPnl;

            // ─── Trailing max drawdown ─────────────────────────────────────
            if (UseTrailingDrawdown && !ddBreached)
            {
                if (DrawdownMode == DrawdownType.EndOfDay)
                {
                    if (newDay) ddPeak = Math.Max(ddPeak, balance);
                }
                else
                    ddPeak = Math.Max(ddPeak, balance + openBest);
                double newFloor = ddPeak - TrailingDrawdown;
                if (LockTrailing) newFloor = Math.Min(newFloor, accStart + LockOffset);
                ddFloor = Math.Max(ddFloor, newFloor);
            }
            bool breachNow = UseTrailingDrawdown && !ddBreached && balance + openWorst <= ddFloor;

            // ─── Day guards ────────────────────────────────────────────────
            bool dllHit = UseDailyLossLimit && dayRealized + openWorst <= -DailyLossLimit;
            if (!dayHalted)
            {
                if (dllHit) { dayHalted = true; dayHaltWhy = "daily loss limit"; }
                else if (UseDailyGoal && dayRealized >= DailyGoal) { dayHalted = true; dayHaltWhy = "daily goal reached"; }
                else if (MaxLosersPerDay > 0 && dayLosses >= MaxLosersPerDay) { dayHalted = true; dayHaltWhy = "max losers"; }
            }
            bool tradesLeft = MaxTradesPerDay == 0 || dayEntries < MaxTradesPerDay;

            // ─── Session (New York time) ───────────────────────────────────
            DateTime closeEt = ToNewYork(Time[0]);
            DateTime openEt = BarsPeriod.BarsPeriodType == BarsPeriodType.Minute ? closeEt.AddMinutes(-BarsPeriod.Value)
                            : CurrentBar > 0 ? ToNewYork(Time[1]) : closeEt;
            bool isIntra = BarsPeriod.BarsPeriodType != BarsPeriodType.Day && BarsPeriod.BarsPeriodType != BarsPeriodType.Week
                        && BarsPeriod.BarsPeriodType != BarsPeriodType.Month && BarsPeriod.BarsPeriodType != BarsPeriodType.Year;
            int openMin = openEt.Hour * 60 + openEt.Minute;
            int closeMin = closeEt.Hour * 60 + closeEt.Minute;
            int startMin = HhmmToMin(EntryStart), endMin = HhmmToMin(EntryEnd), flatMin = HhmmToMin(FlatTime);
            bool weekday = openEt.DayOfWeek != DayOfWeek.Saturday && openEt.DayOfWeek != DayOfWeek.Sunday;
            bool inSess = startMin <= endMin ? openMin >= startMin && openMin < endMin : openMin >= startMin || openMin < endMin;
            bool inWindow = !(UseEntryWindow && isIntra) || (weekday && inSess);
            bool flatZone = UseForceFlat && isIntra && closeMin >= flatMin && openMin < GlobexOpenMin;

            bool cooldownOk = CooldownBars == 0 || lastExitBar < 0 || CurrentBar - lastExitBar > CooldownBars;
            bool gatesOk = inWindow && !flatZone && !dayHalted && tradesLeft && cooldownOk;

            // ─── Risk engine ───────────────────────────────────────────────
            bool wantLong = eng.LongSignal && !inLong && (!inShort || Opposite == OppositeSignal.Reverse);
            bool wantShort = eng.ShortSignal && !inShort && (!inLong || Opposite == OppositeSignal.Reverse);

            // Account blown = drawdown hit, or a signal arrives while flat and the room
            // left can't cover even 1 contract (the account can no longer trade).
            string src0;
            double budget0 = RiskEngine.Budget(MaxLossPerTrade, UseDailyLossLimit, DailyLossLimit, dayPnl, UseTrailingDrawdown, equity, ddFloor, SafetyBuffer, out src0);
            TradePlan plan0 = MakePlan(budget0, tickSize, tickValue, feeRT);
            bool stallNow = UseTrailingDrawdown && !ddBreached && !inPos && (wantLong || wantShort) && gatesOk && plan0.Qty < 1 && src0 == "drawdown room";
            bool justBlown = false;
            if (breachNow || stallNow)
            {
                accBlown++;
                justBlown = true;
                if (OnBlown == WhenBlown.StartNewAccount && !liveMode)
                {
                    accStart = equity;
                    ddPeak = equity;
                    ddFloor = equity - TrailingDrawdown;
                }
                else
                    ddBreached = true;
                if (ShowTradeMarkers)
                    Draw.Text(this, "rcpBlown" + accBlown, "ACCOUNT BLOWN #" + accBlown, 0, High[0] + 20 * tickSize, Brushes.Red);
                Print(string.Format("{0}  ACCOUNT BLOWN #{1} (equity {2:N0}, floor {3:N0})", Time[0], accBlown, equity, ddFloor));
            }

            string budgetSrc;
            double budget = RiskEngine.Budget(MaxLossPerTrade, UseDailyLossLimit, DailyLossLimit, dayPnl, UseTrailingDrawdown, equity, ddFloor, SafetyBuffer, out budgetSrc);
            TradePlan plan = MakePlan(budget, tickSize, tickValue, feeRT);
            bool canOpen = gatesOk && !ddBreached;

            // ─── Orders ────────────────────────────────────────────────────
            bool goLong = wantLong && canOpen && plan.Qty >= 1;
            bool goShort = wantShort && canOpen && plan.Qty >= 1;
            if ((wantLong || wantShort) && canOpen && plan.Qty < 1)
                skipped++;

            // 1) Forced exits: account blown, end of session, daily loss limit
            string flatWhy = null;
            if (inPos)
            {
                if (ddBreached || justBlown) flatWhy = "Account blown";
                else if (flatZone) flatWhy = "Session close";
                else if (dllHit) flatWhy = "Daily loss limit";
            }
            if (flatWhy != null)
            {
                pendDir = 0;
                if (inLong) ExitLong(flatWhy, LongSig); else ExitShort(flatWhy, ShortSig);
            }

            // 2) Opposite signal → close only
            if (flatWhy == null && Opposite == OppositeSignal.Close)
            {
                if (inLong && eng.ShortSignal) ExitLong("Opposite", LongSig);
                else if (inShort && eng.LongSignal) ExitShort("Opposite", ShortSig);
            }

            // 3) New entry, or reversal (close first, enter once flat — see OnPositionUpdate)
            if ((goLong || goShort) && flatWhy == null)
            {
                int dir = goLong ? 1 : -1;
                if (goLong) eng.UsedUpX = eng.UpXBar; else eng.UsedDnX = eng.DnXBar;
                if (inPos)
                {
                    pendDir = dir; pendBar = CurrentBar; pendPlan = plan; pendAtr = eng.Atr;
                    if (inLong) ExitLong("Reverse", LongSig); else ExitShort("Reverse", ShortSig);
                }
                else
                    SubmitEntry(dir, plan, eng.Atr, tickSize);

                if (ShowTradeMarkers)
                    DrawEntry(dir, plan, budget, budgetSrc, tickSize, tickValue, feeRT);
            }

            // 4) Break-even / trailing stop (moved at bar close)
            if (inPos && flatWhy == null && !goLong && !goShort)
                ManageStop(inLong, avgPx, tickSize);

            // ─── Dashboard ─────────────────────────────────────────────────
            if (ShowDashboard && (State == State.Realtime || CurrentBar >= Count - 2))
                Draw.TextFixed(this, "rcpDash", Dashboard(inPos, inLong, posQty, avgPx, openPnl, plan, budget, budgetSrc,
                    dayPnl, equity, inWindow && !flatZone, tradesLeft, tickSize, tickValue, feeRT), TextPosition.TopRight);
        }

        protected override void OnPositionUpdate(Position position, double averagePrice, int quantity, MarketPosition marketPosition)
        {
            // second half of a reversal: the old position is closed, now enter the new one
            if (pendDir != 0 && marketPosition == MarketPosition.Flat)
            {
                int dir = pendDir;
                pendDir = 0;
                if (!ddBreached && !dayHalted)
                    SubmitEntry(dir, pendPlan, pendAtr, Instrument.MasterInstrument.TickSize);
            }
        }

        #region Helpers
        private TradePlan MakePlan(double budget, double tickSize, double tickValue, double feeRT)
        {
            return RiskEngine.Plan(SizeMode, budget, eng.Atr, tickSize, tickValue, feeRT, (int)Slippage, MaxLossPerTrade,
                MaxProfitPerTrade, FixedContracts, MaxContracts, StopAtrMult, TargetAtrMult, MinStopTicks);
        }

        private void SubmitEntry(int dir, TradePlan p, double atrNow, double tickSize)
        {
            string sig = dir > 0 ? LongSig : ShortSig;
            trSl = p.StopTicks; trTp = p.TargetTicks;
            trTrailPts = UseTrailing ? Math.Max(1, RiskEngine.PineRound(p.TargetTicks * TrailStartPct / 100.0)) : 0;
            trTrailOff = UseTrailing ? Math.Max(1, RiskEngine.PineRound(atrNow * TrailAtrMult / tickSize)) : 0;
            mfePx = double.NaN; stopPx = double.NaN; beDone = false;
            dayEntries++; totEntries++;
            maxDayEnt = Math.Max(maxDayEnt, dayEntries);
            // stop and target in ticks from the real fill price → the $ amount is exact whatever the fill
            SetStopLoss(sig, CalculationMode.Ticks, p.StopTicks, false);
            SetProfitTarget(sig, CalculationMode.Ticks, p.TargetTicks);
            if (dir > 0) EnterLong(p.Qty, LongSig); else EnterShort(p.Qty, ShortSig);
        }

        private void ManageStop(bool inLong, double avgPx, double tickSize)
        {
            int d = inLong ? 1 : -1;
            string sig = inLong ? LongSig : ShortSig;
            mfePx = double.IsNaN(mfePx) ? (inLong ? High[0] : Low[0]) : inLong ? Math.Max(mfePx, High[0]) : Math.Min(mfePx, Low[0]);
            double runTicks = (inLong ? mfePx - avgPx : avgPx - mfePx) / tickSize;

            double newStop = double.NaN;
            string why = "BE";
            if (UseBreakEven && !beDone && runTicks >= trTp * BreakEvenPct / 100.0)
            {
                beDone = true;
                newStop = avgPx + d * BreakEvenOffsetTicks * tickSize;
            }
            if (UseTrailing && trTrailPts > 0 && runTicks >= trTrailPts)
            {
                double t = mfePx - d * trTrailOff * tickSize;
                if (double.IsNaN(newStop) || d * (t - newStop) > 0) { newStop = t; why = "Trail"; }
            }
            if (double.IsNaN(newStop)) return;

            double current = double.IsNaN(stopPx) ? avgPx - d * trSl * tickSize : stopPx;
            newStop = Instrument.MasterInstrument.RoundToTickSize(newStop);
            if (d * (newStop - current) <= 0) return;            // only ever tighten
            if (d * (Close[0] - newStop) > 0)
            {
                SetStopLoss(sig, CalculationMode.Price, newStop, false);
                stopPx = newStop;
            }
            else if (inLong) ExitLong(why, LongSig);             // price already through the new stop
            else ExitShort(why, ShortSig);
        }

        private void ProcessClosedTrades()
        {
            int n = SystemPerformance.AllTrades.Count;
            if (n <= seenTrades) return;
            for (int i = seenTrades; i < n; i++)
            {
                Trade t = SystemPerformance.AllTrades[i];
                double p = t.ProfitCurrency - t.Commission;       // net of commission
                realizedTotal += p;
                worstTrade = Math.Min(worstTrade, p);
                bestTrade = Math.Max(bestTrade, p);
                closedCount++;
                if (p > 0) { winCount++; grossWin += p; } else grossLoss -= p;
                dayRealized += p;
                if (p > 0) dayWins++; else if (p < 0) dayLosses++;
            }
            seenTrades = n;
            lastExitBar = CurrentBar;
        }

        private double SourcePrice()
        {
            switch (RsiSource)
            {
                case PriceSource.Open:  return Open[0];
                case PriceSource.High:  return High[0];
                case PriceSource.Low:   return Low[0];
                case PriceSource.HL2:   return (High[0] + Low[0]) / 2.0;
                case PriceSource.HLC3:  return (High[0] + Low[0] + Close[0]) / 3.0;
                case PriceSource.OHLC4: return (Open[0] + High[0] + Low[0] + Close[0]) / 4.0;
                default:                return Close[0];
            }
        }

        private DateTime ToNewYork(DateTime t)
        {
            return TimeZoneInfo.ConvertTime(DateTime.SpecifyKind(t, DateTimeKind.Unspecified), Core.Globals.GeneralOptions.TimeZoneInfo, nyTz);
        }

        private static int HhmmToMin(int hhmm) { return hhmm / 100 * 60 + hhmm % 100; }

        private double AccountValue(AccountItem item)
        {
            try { return Account != null ? Account.Get(item, Currency.UsDollar) : 0.0; }
            catch { return 0.0; }
        }

        private static string Usd(double v)  { return (v < 0 ? "-$" : "$") + Math.Abs(v).ToString("#,##0"); }
        private static string UsdS(double v) { return (v > 0 ? "+$" : v < 0 ? "-$" : "$") + Math.Abs(v).ToString("#,##0"); }
        private string Dist(int t, double tickSize) { return t + "t / " + (t * tickSize).ToString("0.00") + " pts"; }

        private void DrawEntry(int dir, TradePlan p, double budget, string src, double tickSize, double tickValue, double feeRT)
        {
            double risk = p.Qty * ((p.StopTicks + (int)Slippage) * tickValue + feeRT);
            double reward = p.Qty * p.TargetTicks * tickValue;
            string txt = (dir > 0 ? "BUY " : "SELL ") + p.Qty + "\nrisk " + Usd(risk) + " / tgt " + Usd(reward);
            if (dir > 0)
            {
                Draw.ArrowUp(this, "rcpA" + CurrentBar, false, 0, Low[0] - 4 * tickSize, Brushes.LimeGreen);
                Draw.Text(this, "rcpT" + CurrentBar, txt, 0, Low[0] - 16 * tickSize, Brushes.LimeGreen);
            }
            else
            {
                Draw.ArrowDown(this, "rcpA" + CurrentBar, false, 0, High[0] + 4 * tickSize, Brushes.Red);
                Draw.Text(this, "rcpT" + CurrentBar, txt, 0, High[0] + 16 * tickSize, Brushes.Red);
            }
        }

        private string Dashboard(bool inPos, bool inLong, int posQty, double avgPx, double openPnl, TradePlan plan, double budget,
            string budgetSrc, double dayPnl, double equity, bool inSession, bool tradesLeft, double tickSize, double tickValue, double feeRT)
        {
            string status = ddBreached ? "ACCOUNT BLOWN" : dayHalted ? "HALTED: " + dayHaltWhy : !tradesLeft ? "MAX TRADES TODAY"
                          : inPos ? (inLong ? "IN TRADE: LONG" : "IN TRADE: SHORT") : !inSession ? "OUTSIDE SESSION"
                          : plan.Qty < 1 ? "NO RISK ROOM" : "READY";
            int q = inPos ? posQty : plan.Qty, sl = inPos ? trSl : plan.StopTicks, tp = inPos ? trTp : plan.TargetTicks;
            double risk = q * ((sl + (int)Slippage) * tickValue + feeRT), reward = q * tp * tickValue;
            bool worstOk = worstTrade >= -MaxLossPerTrade - 1.0, bestOk = bestTrade <= MaxProfitPerTrade + 1.0;

            StringBuilder sb = new StringBuilder();
            sb.AppendLine("RutaCrypto PROP  |  " + status + (liveMode ? "  |  LIVE" : "  |  backtest"));
            sb.AppendLine("CONTRACT  " + Instrument.FullName + "   tick " + tickSize + " = $" + tickValue.ToString("0.00##"));
            if (inPos)
                sb.AppendLine("OPEN      " + (inLong ? "LONG " : "SHORT ") + q + " @ " + avgPx.ToString("0.00") + "   open P/L " + UsdS(openPnl));
            else
                sb.AppendLine("NEXT      " + (q >= 1 ? q + " contracts" : "no trade") + "   budget " + Usd(budget) + " (" + budgetSrc + ")");
            if (q >= 1)
                sb.AppendLine("          stop " + (inPos && beDone ? "break-even" : Dist(sl, tickSize) + " = -" + Usd(risk))
                    + "   target " + Dist(tp, tickSize) + " = " + UsdS(reward));
            sb.AppendLine("TODAY     P/L " + UsdS(dayPnl) + "   trades " + dayEntries + (MaxTradesPerDay > 0 ? "/" + MaxTradesPerDay : "")
                + "   W/L " + dayWins + "/" + dayLosses + (UseDailyLossLimit ? "   loss room " + Usd(DailyLossLimit + dayPnl) : ""));
            sb.AppendLine("ACCOUNT   equity " + Usd(equity) + (UseTrailingDrawdown ? "   floor " + Usd(ddFloor) + "   room " + Usd(equity - ddFloor)
                + "   blown " + accBlown : "   drawdown guard off"));
            sb.AppendLine("CHECK     worst " + UsdS(worstTrade) + (worstOk ? " OK" : " OVER LIMIT") + "   best " + UsdS(bestTrade)
                + (bestOk ? " OK" : " OVER CAP") + "   skipped " + skipped);
            sb.Append("STATS     " + (sessCount > 0 ? (totEntries * 1.0 / sessCount).ToString("0.0") : "-") + " trades/session (max " + maxDayEnt + ")"
                + "   win " + (closedCount > 0 ? (winCount * 100.0 / closedCount).ToString("0.0") + "%" : "-")
                + "   PF " + (grossLoss > 0 ? (grossWin / grossLoss).ToString("0.00") : "-") + "   net " + UsdS(realizedTotal));
            return sb.ToString();
        }
        #endregion

        #region Properties
        // 1. Per-trade risk
        [NinjaScriptProperty]
        [Display(Name = "Sizing mode", Order = 1, GroupName = "1. Per-trade risk (prop firm)")]
        public SizingMode SizeMode { get; set; }

        [NinjaScriptProperty]
        [Range(1, double.MaxValue)]
        [Display(Name = "Max loss per trade ($)", Description = "Includes round-trip commission and the slippage buffer.", Order = 2, GroupName = "1. Per-trade risk (prop firm)")]
        public double MaxLossPerTrade { get; set; }

        [NinjaScriptProperty]
        [Range(1, double.MaxValue)]
        [Display(Name = "Max profit per trade ($)", Order = 3, GroupName = "1. Per-trade risk (prop firm)")]
        public double MaxProfitPerTrade { get; set; }

        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name = "Contracts (fixed $ mode)", Order = 4, GroupName = "1. Per-trade risk (prop firm)")]
        public int FixedContracts { get; set; }

        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name = "Max contracts (ATR mode)", Description = "Set to your firm's position limit.", Order = 5, GroupName = "1. Per-trade risk (prop firm)")]
        public int MaxContracts { get; set; }

        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name = "ATR length", Order = 6, GroupName = "1. Per-trade risk (prop firm)")]
        public int AtrLength { get; set; }

        [NinjaScriptProperty]
        [Range(0.1, double.MaxValue)]
        [Display(Name = "Stop = ATR x", Order = 7, GroupName = "1. Per-trade risk (prop firm)")]
        public double StopAtrMult { get; set; }

        [NinjaScriptProperty]
        [Range(0.1, double.MaxValue)]
        [Display(Name = "Target = ATR x (capped at max profit)", Order = 8, GroupName = "1. Per-trade risk (prop firm)")]
        public double TargetAtrMult { get; set; }

        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name = "Min stop (ticks, ATR mode)", Order = 9, GroupName = "1. Per-trade risk (prop firm)")]
        public int MinStopTicks { get; set; }

        // 2. Account guard
        [NinjaScriptProperty]
        [Range(1, double.MaxValue)]
        [Display(Name = "Account size ($)", Description = "Starting balance of the account (backtest balance; live: drawdown lock level).", Order = 1, GroupName = "2. Account guard (prop firm)")]
        public double AccountSize { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Trailing max drawdown", Order = 2, GroupName = "2. Account guard (prop firm)")]
        public bool UseTrailingDrawdown { get; set; }

        [NinjaScriptProperty]
        [Range(1, double.MaxValue)]
        [Display(Name = "Trailing drawdown ($)", Order = 3, GroupName = "2. Account guard (prop firm)")]
        public double TrailingDrawdown { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Drawdown trails", Order = 4, GroupName = "2. Account guard (prop firm)")]
        public DrawdownType DrawdownMode { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Stop trailing at start balance +", Order = 5, GroupName = "2. Account guard (prop firm)")]
        public bool LockTrailing { get; set; }

        [NinjaScriptProperty]
        [Range(0, double.MaxValue)]
        [Display(Name = "Lock offset ($)", Order = 6, GroupName = "2. Account guard (prop firm)")]
        public double LockOffset { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "When the account is blown (backtest)", Description = "Live trading always stops and flattens.", Order = 7, GroupName = "2. Account guard (prop firm)")]
        public WhenBlown OnBlown { get; set; }

        [NinjaScriptProperty]
        [Range(0, double.MaxValue)]
        [Display(Name = "LIVE: firm's current drawdown floor ($)", Description = "The account value where your firm fails the account today. 0 = account value at start minus the trailing drawdown.", Order = 8, GroupName = "2. Account guard (prop firm)")]
        public double LiveDrawdownFloor { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Daily loss limit", Order = 9, GroupName = "2. Account guard (prop firm)")]
        public bool UseDailyLossLimit { get; set; }

        [NinjaScriptProperty]
        [Range(1, double.MaxValue)]
        [Display(Name = "Daily loss limit ($)", Order = 10, GroupName = "2. Account guard (prop firm)")]
        public double DailyLossLimit { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Daily profit goal (stop for the day)", Order = 11, GroupName = "2. Account guard (prop firm)")]
        public bool UseDailyGoal { get; set; }

        [NinjaScriptProperty]
        [Range(1, double.MaxValue)]
        [Display(Name = "Daily profit goal ($)", Order = 12, GroupName = "2. Account guard (prop firm)")]
        public double DailyGoal { get; set; }

        [NinjaScriptProperty]
        [Range(0, int.MaxValue)]
        [Display(Name = "Max trades per day (0 = off)", Order = 13, GroupName = "2. Account guard (prop firm)")]
        public int MaxTradesPerDay { get; set; }

        [NinjaScriptProperty]
        [Range(0, int.MaxValue)]
        [Display(Name = "Max losing trades per day (0 = off)", Order = 14, GroupName = "2. Account guard (prop firm)")]
        public int MaxLosersPerDay { get; set; }

        [NinjaScriptProperty]
        [Range(0, double.MaxValue)]
        [Display(Name = "Safety buffer ($)", Order = 15, GroupName = "2. Account guard (prop firm)")]
        public double SafetyBuffer { get; set; }

        // 3. Session
        [NinjaScriptProperty]
        [Display(Name = "Only open trades inside the entry window", Order = 1, GroupName = "3. Session (New York time)")]
        public bool UseEntryWindow { get; set; }

        [NinjaScriptProperty]
        [Range(0, 2359)]
        [Display(Name = "Entry window start (HHMM)", Order = 2, GroupName = "3. Session (New York time)")]
        public int EntryStart { get; set; }

        [NinjaScriptProperty]
        [Range(0, 2359)]
        [Display(Name = "Entry window end (HHMM)", Order = 3, GroupName = "3. Session (New York time)")]
        public int EntryEnd { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Force flat", Order = 4, GroupName = "3. Session (New York time)")]
        public bool UseForceFlat { get; set; }

        [NinjaScriptProperty]
        [Range(0, 1759)]
        [Display(Name = "Force flat at (HHMM)", Order = 5, GroupName = "3. Session (New York time)")]
        public int FlatTime { get; set; }

        // 4. Signal
        [NinjaScriptProperty]
        [Display(Name = "Signal preset", Description = "Active: RSI 30/70, signal memory 2 (1-min chart). Strict: original RSI 20/71. Custom: values below.", Order = 1, GroupName = "4. Signal")]
        public SignalPreset Preset { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Require Heikin-Ashi candle colour", Order = 2, GroupName = "4. Signal")]
        public bool UseHeikinAshi { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "RSI source", Order = 3, GroupName = "4. Signal")]
        public PriceSource RsiSource { get; set; }

        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name = "RSI length", Order = 4, GroupName = "4. Signal")]
        public int RsiLength { get; set; }

        [NinjaScriptProperty]
        [Range(1, 99)]
        [Display(Name = "RSI lower (Custom preset)", Order = 5, GroupName = "4. Signal")]
        public double CustomRsiLower { get; set; }

        [NinjaScriptProperty]
        [Range(1, 99)]
        [Display(Name = "RSI upper (Custom preset)", Order = 6, GroupName = "4. Signal")]
        public double CustomRsiUpper { get; set; }

        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name = "Volume osc fast", Order = 7, GroupName = "4. Signal")]
        public int VolFastLength { get; set; }

        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name = "Volume osc slow", Order = 8, GroupName = "4. Signal")]
        public int VolSlowLength { get; set; }

        [NinjaScriptProperty]
        [Range(-100, 1000)]
        [Display(Name = "Volume osc threshold (-100 = off)", Order = 9, GroupName = "4. Signal")]
        public double VolThreshold { get; set; }

        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name = "Trend SMA length", Order = 10, GroupName = "4. Signal")]
        public int TrendLength { get; set; }

        [NinjaScriptProperty]
        [Range(0, int.MaxValue)]
        [Display(Name = "Signal memory, bars (Custom preset)", Order = 11, GroupName = "4. Signal")]
        public int CustomSignalMemory { get; set; }

        // 5. Extra filters
        [NinjaScriptProperty]
        [Display(Name = "Direction", Order = 1, GroupName = "5. Extra filters")]
        public TradeDirection Direction { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Opposite signal while in a trade", Order = 2, GroupName = "5. Extra filters")]
        public OppositeSignal Opposite { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "VWAP side filter", Order = 3, GroupName = "5. Extra filters")]
        public bool UseVwapFilter { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "HTF EMA trend filter", Order = 4, GroupName = "5. Extra filters")]
        public bool UseHtfFilter { get; set; }

        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name = "HTF minutes", Order = 5, GroupName = "5. Extra filters")]
        public int HtfMinutes { get; set; }

        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name = "HTF EMA length", Order = 6, GroupName = "5. Extra filters")]
        public int HtfEmaLength { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Min ADX filter", Order = 7, GroupName = "5. Extra filters")]
        public bool UseAdxFilter { get; set; }

        [NinjaScriptProperty]
        [Range(0, 100)]
        [Display(Name = "Min ADX", Order = 8, GroupName = "5. Extra filters")]
        public double AdxMin { get; set; }

        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name = "ADX length", Order = 9, GroupName = "5. Extra filters")]
        public int AdxLength { get; set; }

        [NinjaScriptProperty]
        [Range(0, int.MaxValue)]
        [Display(Name = "Cooldown bars after an exit", Order = 10, GroupName = "5. Extra filters")]
        public int CooldownBars { get; set; }

        // 6. Trade management
        [NinjaScriptProperty]
        [Display(Name = "Break-even", Order = 1, GroupName = "6. Trade management")]
        public bool UseBreakEven { get; set; }

        [NinjaScriptProperty]
        [Range(1, 99)]
        [Display(Name = "Break-even at % of the way to target", Order = 2, GroupName = "6. Trade management")]
        public double BreakEvenPct { get; set; }

        [NinjaScriptProperty]
        [Range(0, int.MaxValue)]
        [Display(Name = "Break-even offset (ticks)", Order = 3, GroupName = "6. Trade management")]
        public int BreakEvenOffsetTicks { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Trailing stop", Order = 4, GroupName = "6. Trade management")]
        public bool UseTrailing { get; set; }

        [NinjaScriptProperty]
        [Range(1, 99)]
        [Display(Name = "Trailing starts at % of the way to target", Order = 5, GroupName = "6. Trade management")]
        public double TrailStartPct { get; set; }

        [NinjaScriptProperty]
        [Range(0.1, double.MaxValue)]
        [Display(Name = "Trail distance (x ATR)", Order = 6, GroupName = "6. Trade management")]
        public double TrailAtrMult { get; set; }

        // 7. Costs
        [NinjaScriptProperty]
        [Range(0, double.MaxValue)]
        [Display(Name = "Commission per contract, per side ($)", Description = "Used by the risk engine. Keep equal to your commission template. Slippage is the strategy's Slippage setting.", Order = 1, GroupName = "7. Costs")]
        public double FeePerSide { get; set; }

        // 8. Display
        [Display(Name = "Dashboard", Order = 1, GroupName = "8. Display")]
        public bool ShowDashboard { get; set; }

        [Display(Name = "Trade markers", Order = 2, GroupName = "8. Display")]
        public bool ShowTradeMarkers { get; set; }
        #endregion
    }
}
