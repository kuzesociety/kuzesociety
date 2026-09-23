// Minimal stand-ins for the NinjaTrader 8 / WPF APIs used by RutaCryptoPROP.cs (compile check only).
using System;
namespace System.Windows { }
namespace System.Windows.Input { }
namespace System.Windows.Media {
    public class Brush { }
    public static class Brushes { public static Brush Red = new Brush(), LimeGreen = new Brush(); }
}
namespace System.ComponentModel.DataAnnotations {
    [AttributeUsage(AttributeTargets.All)] public class DisplayAttribute : Attribute { public string Name { get; set; } public string Description { get; set; } public int Order { get; set; } public string GroupName { get; set; } }
    [AttributeUsage(AttributeTargets.All)] public class RangeAttribute : Attribute { public RangeAttribute(int a, int b) { } public RangeAttribute(double a, double b) { } }
}
namespace NinjaTrader.Gui { } namespace NinjaTrader.Gui.Chart { } namespace NinjaTrader.Gui.SuperDom { } namespace NinjaTrader.Gui.Tools { }
namespace NinjaTrader.Core.FloatingPoint { } namespace NinjaTrader.NinjaScript.Indicators { }
namespace NinjaTrader.Core {
    public class GeneralOptionsStub { public TimeZoneInfo TimeZoneInfo = TimeZoneInfo.Local; }
    public static class Globals { public static GeneralOptionsStub GeneralOptions = new GeneralOptionsStub(); }
}
namespace NinjaTrader.Cbi {
    public enum MarketPosition { Flat, Long, Short }
    public enum PerformanceUnit { Currency, Percent, Pips, Points, Ticks }
    public enum AccountItem { CashValue, NetLiquidation, RealizedProfitLoss }
    public enum Currency { UsDollar }
    public enum TimeInForce { Day, Gtc }
    public class Account { public string Name = "Sim101"; public double Get(AccountItem i, Currency c) { return 0; } }
    public class Position { public MarketPosition MarketPosition; public int Quantity; public double AveragePrice;
        public double GetUnrealizedProfitLoss(PerformanceUnit u, double price) { return 0; } }
    public class MasterInstrument { public double TickSize = 0.25, PointValue = 2; public double RoundToTickSize(double p) { return Math.Round(p / TickSize) * TickSize; } }
    public class Instrument { public MasterInstrument MasterInstrument = new MasterInstrument(); public string FullName = "MNQ 12-26"; }
    public class Trade { public double ProfitCurrency, Commission; }
    public class TradeCollection { public int Count { get { return 0; } } public Trade this[int i] { get { return new Trade(); } } }
}
namespace NinjaTrader.Data {
    public enum BarsPeriodType { Tick, Volume, Range, Second, Minute, Day, Week, Month, Year }
    public class BarsPeriod { public BarsPeriodType BarsPeriodType; public int Value; }
    public class Bars { public bool IsFirstBarOfSession; }
}
namespace NinjaTrader.NinjaScript {
    using NinjaTrader.Cbi; using NinjaTrader.Data;
    [AttributeUsage(AttributeTargets.Property)] public class NinjaScriptPropertyAttribute : Attribute { }
    public enum State { SetDefaults, Configure, Active, DataLoaded, Historical, Transition, Realtime, Terminated }
    public enum Calculate { OnBarClose, OnEachTick, OnPriceChange }
    public enum EntryHandling { AllEntries, UniqueEntries }
    public enum MaximumBarsLookBack { TwoHundredFiftySix, Infinite }
    public enum OrderFillResolution { Standard, High }
    public enum StartBehavior { WaitUntilFlat, ImmediatelySubmit }
    public enum RealtimeErrorHandling { StopCancelClose, IgnoreAllErrors }
    public enum StopTargetHandling { PerEntryExecution, ByStrategyPosition }
    public enum CalculationMode { Currency, Percent, Price, Ticks }
    public interface ISeries<T> { T this[int barsAgo] { get; } }
    public class Series<T> : ISeries<T> { public T this[int barsAgo] { get { return default(T); } } }
    public class SystemPerformanceStub { public TradeCollection AllTrades = new TradeCollection(); }
    public abstract class NinjaScriptBase {
        public string Description, Name; public State State; public int CurrentBar, Count, BarsInProgress;
        public double TickSize = 0.25;
        public ISeries<double> Open = new Series<double>(), High = new Series<double>(), Low = new Series<double>(), Close = new Series<double>(), Volume = new Series<double>();
        public ISeries<DateTime> Time = new Series<DateTime>();
        public ISeries<double>[] Closes = new ISeries<double>[2];
        public Bars Bars = new Bars(); public BarsPeriod BarsPeriod = new BarsPeriod(); public Instrument Instrument = new Instrument();
        public void Print(string s) { Console.WriteLine(s); }
        public void AddDataSeries(BarsPeriodType t, int value) { }
        protected virtual void OnStateChange() { } protected virtual void OnBarUpdate() { }
    }
    public class Strategy : NinjaScriptBase {
        public Calculate Calculate; public int EntriesPerDirection; public EntryHandling EntryHandling; public bool IsExitOnSessionCloseStrategy;
        public int ExitOnSessionCloseSeconds; public bool IsFillLimitOnTouch; public MaximumBarsLookBack MaximumBarsLookBack;
        public OrderFillResolution OrderFillResolution; public int Slippage; public StartBehavior StartBehavior; public TimeInForce TimeInForce;
        public bool TraceOrders; public RealtimeErrorHandling RealtimeErrorHandling; public StopTargetHandling StopTargetHandling;
        public int BarsRequiredToTrade; public bool IncludeCommission, IsInstantiatedOnEachOptimizationIteration;
        public Account Account = new Account(); public Position Position = new Position(); public SystemPerformanceStub SystemPerformance = new SystemPerformanceStub();
        public void SetStopLoss(string fromEntrySignal, CalculationMode mode, double value, bool isSimulatedStop) { }
        public void SetProfitTarget(string fromEntrySignal, CalculationMode mode, double value) { }
        public void EnterLong(int quantity, string signalName) { } public void EnterShort(int quantity, string signalName) { }
        public void ExitLong(string signalName, string fromEntrySignal) { } public void ExitShort(string signalName, string fromEntrySignal) { }
        protected virtual void OnPositionUpdate(Position position, double averagePrice, int quantity, MarketPosition marketPosition) { }
    }
}
namespace NinjaTrader.NinjaScript.DrawingTools {
    using NinjaTrader.NinjaScript; using System.Windows.Media;
    public enum TextPosition { BottomLeft, BottomRight, Center, TopLeft, TopRight }
    public static class Draw {
        public static object TextFixed(NinjaScriptBase owner, string tag, string text, TextPosition pos) { return null; }
        public static object Text(NinjaScriptBase owner, string tag, string text, int barsAgo, double y, Brush brush) { return null; }
        public static object ArrowUp(NinjaScriptBase owner, string tag, bool isAutoScale, int barsAgo, double y, Brush brush) { return null; }
        public static object ArrowDown(NinjaScriptBase owner, string tag, bool isAutoScale, int barsAgo, double y, Brush brush) { return null; }
    }
}
namespace NinjaTrader.NinjaScript.Strategies { }
