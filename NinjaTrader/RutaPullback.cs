// ════════════════════════════════════════════════════════════════════════════
//  RutaPullback — NinjaTrader 8 strategy
//  Always-ready bracket bot: fixed contracts, $1,500 target / $2,000 stop, a new
//  decision at every 5-minute candle close while flat.
//
//  Default rule "PullbackInTrend": trade in the direction of the hourly trend
//  (price vs 60-minute EMA 50), entering on a 5-minute candle that pulls back
//  against it (red candle in an uptrend → buy, green candle in a downtrend → sell).
//  The other rules are there to compare, including the "follow the candle, keep
//  after a win, flip after a loss" logic of the bot this replaces.
//
//  Install: copy to  Documents\NinjaTrader 8\bin\Custom\Strategies\  and press F5
//           in the NinjaScript Editor.
//  Chart:   MNQ, 5 Minute, trading hours "CME US Index Futures RTH".
//  Backtest: Order fill resolution = High, 1 Minute (stops/targets checked each minute).
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
using RutaPullbackBot;
#endregion

namespace RutaPullbackBot
{
    public enum DirectionRule
    {
        PullbackInTrend,          // hourly trend direction, entered on a counter-trend 5-min candle
        FadeCandle,               // opposite of the 5-min candle that just closed
        FollowTrend,              // hourly trend direction on every candle
        FollowCandle,             // same direction as the 5-min candle that just closed
        FollowCandlePersistFlip   // 1st trade follows the candle; keep after a win, flip after a loss
    }

    /// <summary>Pine ta.ema: SMA of the first n values, then alpha = 2 / (n + 1).</summary>
    public sealed class Ema
    {
        private readonly int n;
        private readonly double alpha;
        private int count;
        private double sum;
        public double Value = double.NaN;
        public Ema(int length) { n = Math.Max(1, length); alpha = 2.0 / (n + 1); }
        public void Update(double x)
        {
            if (count < n)
            {
                sum += x;
                count++;
                if (count == n) Value = sum / n;
                return;
            }
            Value = alpha * x + (1 - alpha) * Value;
        }
    }

    /// <summary>EMA of clock-hour closes (New York time). Value = as of the last completed hour.</summary>
    public sealed class HourlyTrend
    {
        private readonly Ema ema;
        private long hourKey = long.MinValue;
        private double lastClose = double.NaN;
        public double Value { get { return ema.Value; } }
        public HourlyTrend(int length) { ema = new Ema(length); }
        public void Update(DateTime barOpenNy, double close)
        {
            long key = barOpenNy.Ticks / TimeSpan.TicksPerHour;
            if (key != hourKey)
            {
                if (hourKey != long.MinValue) ema.Update(lastClose);   // the previous hour just completed
                hourKey = key;
            }
            lastClose = close;
        }
    }

    public static class Direction
    {
        /// <summary>+1 buy, -1 sell, 0 no trade. candle / trend are -1, 0 or +1.
        /// For FollowCandlePersistFlip, carried = direction decided by the previous trade (0 = none today).</summary>
        public static int Decide(DirectionRule rule, int candle, int trend, int carried)
        {
            switch (rule)
            {
                case DirectionRule.PullbackInTrend: return trend != 0 && -candle == trend ? trend : 0;
                case DirectionRule.FadeCandle:      return -candle;
                case DirectionRule.FollowTrend:     return trend;
                case DirectionRule.FollowCandle:    return candle;
                default:                            return carried != 0 ? carried : candle;
            }
        }

        public static int Sign(double x) { return x > 0 ? 1 : x < 0 ? -1 : 0; }
    }
}

namespace NinjaTrader.NinjaScript.Strategies
{
    public class RutaPullback : Strategy
    {
        private const string LongSig = "Long", ShortSig = "Short";
        private const int GlobexOpenMin = 18 * 60;

        private HourlyTrend trend;
        private TimeZoneInfo nyTz;
        private int slTicks, tpTicks;

        private int carriedDir, lastEntryDir;
        private double dayRealized;
        private int dayTrades, seenTrades, totTrades, wins, sessions;
        private double netTotal;
        private bool dayStopped;
        private string dayStopWhy = "";

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description = "RutaPullback: fixed-contract $1,500 / $2,000 bracket bot on 5-minute candles, entering hourly-trend pullbacks.";
                Name = "RutaPullback";
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
                BarsRequiredToTrade = 1;
                IncludeCommission = true;
                IsInstantiatedOnEachOptimizationIteration = true;

                Contracts = 15;
                MaxLossPerTrade = 2000;
                MaxProfitPerTrade = 1500;
                FeePerSide = 0.62;
                Rule = DirectionRule.PullbackInTrend;
                TrendEmaLength = 50;
                EntryStart = 930;
                EntryEnd = 1545;
                FlatTime = 1555;
                MaxTradesPerDay = 0;
                UseDailyLossLimit = false;
                DailyLossLimit = 4000;
                UseDailyGoal = false;
                DailyGoal = 3000;
                ShowDashboard = true;
            }
            else if (State == State.DataLoaded)
            {
                trend = new HourlyTrend(TrendEmaLength);
                nyTz = TimeZoneInfo.FindSystemTimeZoneById("Eastern Standard Time");
            }
            else if (State == State.Realtime)
            {
                // live: start the day's counters fresh (the backtest trades were virtual)
                dayRealized = 0; dayTrades = 0; dayStopped = false; dayStopWhy = "";
                seenTrades = SystemPerformance.AllTrades.Count;
            }
        }

        protected override void OnBarUpdate()
        {
            if (BarsInProgress != 0) return;

            double tickSize = Instrument.MasterInstrument.TickSize;
            double tickValue = tickSize * Instrument.MasterInstrument.PointValue;
            double feeRT = 2.0 * FeePerSide;
            // exact $ bracket for the chosen size: a stop-out loses MaxLoss (fees + slippage included),
            // a win makes MaxProfit after fees
            slTicks = (int)Math.Floor((MaxLossPerTrade / Contracts - feeRT) / tickValue) - (int)Slippage;
            tpTicks = (int)Math.Floor((MaxProfitPerTrade / Contracts + feeRT) / tickValue);

            DateTime closeNy = ToNewYork(Time[0]);
            DateTime openNy = BarsPeriod.BarsPeriodType == BarsPeriodType.Minute ? closeNy.AddMinutes(-BarsPeriod.Value)
                            : CurrentBar > 0 ? ToNewYork(Time[1]) : closeNy;
            trend.Update(openNy, Close[0]);

            if (Bars.IsFirstBarOfSession)
            {
                sessions++;
                dayRealized = 0; dayTrades = 0; dayStopped = false; dayStopWhy = "";
                carriedDir = 0;
            }
            ProcessClosedTrades();

            bool inPos = Position.MarketPosition != MarketPosition.Flat;
            double openPnl = inPos ? Position.GetUnrealizedProfitLoss(PerformanceUnit.Currency, Close[0]) : 0.0;
            if (!dayStopped)
            {
                if (UseDailyLossLimit && dayRealized + openPnl <= -DailyLossLimit) { dayStopped = true; dayStopWhy = "daily loss limit"; }
                else if (UseDailyGoal && dayRealized >= DailyGoal) { dayStopped = true; dayStopWhy = "daily goal"; }
            }

            int openMin = openNy.Hour * 60 + openNy.Minute, closeMin = closeNy.Hour * 60 + closeNy.Minute;
            int startMin = EntryStart / 100 * 60 + EntryStart % 100, endMin = EntryEnd / 100 * 60 + EntryEnd % 100;
            int flatMin = FlatTime / 100 * 60 + FlatTime % 100;
            bool weekday = openNy.DayOfWeek != DayOfWeek.Saturday && openNy.DayOfWeek != DayOfWeek.Sunday;
            bool flatZone = closeMin >= flatMin && openMin < GlobexOpenMin;
            bool inWindow = weekday && openMin >= startMin && openMin < endMin && !flatZone;

            // forced exits
            if (inPos && (flatZone || (dayStopped && dayStopWhy == "daily loss limit")))
            {
                string why = flatZone ? "Session close" : "Daily loss limit";
                if (Position.MarketPosition == MarketPosition.Long) ExitLong(why, LongSig); else ExitShort(why, ShortSig);
                inPos = false;
            }

            // new trade at the candle close while flat
            int candle = Direction.Sign(Close[0] - Open[0]);
            int trendDir = double.IsNaN(trend.Value) ? 0 : Direction.Sign(Close[0] - trend.Value);
            int dir = Direction.Decide(Rule, candle, trendDir, carriedDir);
            if (!inPos && Position.MarketPosition == MarketPosition.Flat && inWindow && !dayStopped
                && (MaxTradesPerDay == 0 || dayTrades < MaxTradesPerDay) && dir != 0 && slTicks >= 1 && tpTicks >= 1)
            {
                string sig = dir > 0 ? LongSig : ShortSig;
                SetStopLoss(sig, CalculationMode.Ticks, slTicks, false);
                SetProfitTarget(sig, CalculationMode.Ticks, tpTicks);
                if (dir > 0) EnterLong(Contracts, LongSig); else EnterShort(Contracts, ShortSig);
                lastEntryDir = dir;
                carriedDir = dir;
                dayTrades++;
            }

            if (ShowDashboard && (State == State.Realtime || CurrentBar >= Count - 2))
                Draw.TextFixed(this, "rpbDash", Dashboard(trendDir, tickSize, tickValue, feeRT, openPnl), TextPosition.TopRight);
        }

        private void ProcessClosedTrades()
        {
            int n = SystemPerformance.AllTrades.Count;
            if (n <= seenTrades) return;
            double posPnl = 0;
            for (int i = seenTrades; i < n; i++)
            {
                Trade t = SystemPerformance.AllTrades[i];
                posPnl += t.ProfitCurrency - t.Commission;       // net of commission
            }
            seenTrades = n;
            dayRealized += posPnl;
            netTotal += posPnl;
            totTrades++;
            if (posPnl > 0) wins++;
            // persist/flip logic: keep the direction after a win, flip it after a loss
            carriedDir = posPnl > 0 ? lastEntryDir : -lastEntryDir;
        }

        private DateTime ToNewYork(DateTime t)
        {
            return TimeZoneInfo.ConvertTime(DateTime.SpecifyKind(t, DateTimeKind.Unspecified), Core.Globals.GeneralOptions.TimeZoneInfo, nyTz);
        }

        private static string Usd(double v) { return (v < 0 ? "-$" : "$") + Math.Abs(v).ToString("#,##0"); }

        private string Dashboard(int trendDir, double tickSize, double tickValue, double feeRT, double openPnl)
        {
            double risk = Contracts * ((slTicks + (int)Slippage) * tickValue + feeRT);
            double reward = Contracts * (tpTicks * tickValue - feeRT);
            StringBuilder sb = new StringBuilder();
            sb.AppendLine("RutaPullback  |  " + Rule + (dayStopped ? "  |  STOPPED: " + dayStopWhy : ""));
            sb.AppendLine(Contracts + " x " + Instrument.FullName + "   stop " + slTicks + "t (" + (slTicks * tickSize).ToString("0.00") + " pts) = -" + Usd(risk)
                + "   target " + tpTicks + "t (" + (tpTicks * tickSize).ToString("0.00") + " pts) = +" + Usd(reward));
            sb.AppendLine("hourly trend " + (trendDir > 0 ? "UP" : trendDir < 0 ? "DOWN" : "-") + "   open P/L " + Usd(openPnl));
            sb.AppendLine("today " + Usd(dayRealized) + " in " + dayTrades + " trades");
            sb.Append("all: " + totTrades + " trades, win " + (totTrades > 0 ? (wins * 100.0 / totTrades).ToString("0.0") + "%" : "-")
                + ", " + (sessions > 0 ? (totTrades * 1.0 / sessions).ToString("0.0") : "-") + "/session, net " + Usd(netTotal));
            return sb.ToString();
        }

        #region Properties
        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name = "Contracts", Description = "Fixed size. Fewer contracts = wider stop/target in points.", Order = 1, GroupName = "1. Bracket")]
        public int Contracts { get; set; }

        [NinjaScriptProperty]
        [Range(1, double.MaxValue)]
        [Display(Name = "Max loss per trade ($)", Description = "Stop distance is set so a full stop-out (fees + slippage included) costs this.", Order = 2, GroupName = "1. Bracket")]
        public double MaxLossPerTrade { get; set; }

        [NinjaScriptProperty]
        [Range(1, double.MaxValue)]
        [Display(Name = "Max profit per trade ($)", Description = "Target is set so a win makes this after commission.", Order = 3, GroupName = "1. Bracket")]
        public double MaxProfitPerTrade { get; set; }

        [NinjaScriptProperty]
        [Range(0, double.MaxValue)]
        [Display(Name = "Commission per contract, per side ($)", Description = "Keep equal to your commission template.", Order = 4, GroupName = "1. Bracket")]
        public double FeePerSide { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Direction rule", Order = 1, GroupName = "2. Direction")]
        public DirectionRule Rule { get; set; }

        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name = "Hourly trend EMA length", Order = 2, GroupName = "2. Direction")]
        public int TrendEmaLength { get; set; }

        [NinjaScriptProperty]
        [Range(0, 2359)]
        [Display(Name = "Entry window start (HHMM, New York)", Order = 1, GroupName = "3. Session")]
        public int EntryStart { get; set; }

        [NinjaScriptProperty]
        [Range(0, 2359)]
        [Display(Name = "Entry window end (HHMM, New York)", Order = 2, GroupName = "3. Session")]
        public int EntryEnd { get; set; }

        [NinjaScriptProperty]
        [Range(0, 1759)]
        [Display(Name = "Force flat at (HHMM, New York)", Order = 3, GroupName = "3. Session")]
        public int FlatTime { get; set; }

        [NinjaScriptProperty]
        [Range(0, int.MaxValue)]
        [Display(Name = "Max trades per day (0 = off)", Order = 1, GroupName = "4. Day limits")]
        public int MaxTradesPerDay { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Daily loss limit", Order = 2, GroupName = "4. Day limits")]
        public bool UseDailyLossLimit { get; set; }

        [NinjaScriptProperty]
        [Range(1, double.MaxValue)]
        [Display(Name = "Daily loss limit ($)", Order = 3, GroupName = "4. Day limits")]
        public double DailyLossLimit { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Daily profit goal (stop for the day)", Order = 4, GroupName = "4. Day limits")]
        public bool UseDailyGoal { get; set; }

        [NinjaScriptProperty]
        [Range(1, double.MaxValue)]
        [Display(Name = "Daily profit goal ($)", Order = 5, GroupName = "4. Day limits")]
        public double DailyGoal { get; set; }

        [Display(Name = "Dashboard", Order = 1, GroupName = "5. Display")]
        public bool ShowDashboard { get; set; }
        #endregion
    }
}
