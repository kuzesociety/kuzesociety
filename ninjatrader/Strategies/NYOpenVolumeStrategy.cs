#region Using declarations
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.IO;
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
using NinjaTrader.NinjaScript.AddOns.NYOpen;
using NinjaTrader.NinjaScript.Indicators;
using NinjaTrader.NinjaScript.DrawingTools;
#endregion

// ═══════════════════════════════════════════════════════════════════════════
//  NY OPEN · VOLUME STRATEGY (backtest + learning)
//
//  At the close of the NY opening candle (09:30–09:35) it compares the candle's
//  volume with the same candle of the previous sessions, then:
//
//    Mode = Rules     → the Pine hypothesis: volume ≥ base → trade WITH the candle
//                        (optionally fade below-base volume)
//    Mode = Buckets   → trade a volume bucket only while it has paid so far
//    Mode = Knn       → look up the most similar past openings
//    Mode = Logistic  → logistic regression on the opening features
//
//  The learners only learn from sessions that already finished, so every
//  backtest is walk-forward by construction: no day is decided with its own future.
//
//  Exit: stop (candle extreme or x range), optional target in R, and a time exit
//  at "Exit minutes after open" (390 = 16:00 NY).
//
//  Use a 1- or 5-minute chart of an instrument with real volume (NQ / MNQ / ES / MES).
//  Needs NYOpenCore.cs in bin/Custom/AddOns. See ninjatrader/README.md.
// ═══════════════════════════════════════════════════════════════════════════
namespace NinjaTrader.NinjaScript.Strategies
{
	public class NYOpenVolumeStrategy : Strategy
	{
		private const string SignalName = "NYO";

		private NyoRunner runner;
		private TimeZoneInfo nyZone;
		private TimeZoneInfo ntZone;
		private int barMinutes;
		private bool badTimeframe;
		private DateTime exitAtNy = DateTime.MinValue;
		private SimpleFont font;

		protected override void OnStateChange()
		{
			if (State == State.SetDefaults)
			{
				Description = "NY opening candle volume vs previous sessions. Rules mode = the Pine hypothesis; Buckets / Knn / Logistic learn from past sessions (walk-forward).";
				Name = "NYOpenVolumeStrategy";
				Calculate = Calculate.OnBarClose;
				EntriesPerDirection = 1;
				EntryHandling = EntryHandling.AllEntries;
				IsExitOnSessionCloseStrategy = true;
				ExitOnSessionCloseSeconds = 30;
				IsFillLimitOnTouch = false;
				MaximumBarsLookBack = MaximumBarsLookBack.TwoHundredFiftySix;
				OrderFillResolution = OrderFillResolution.Standard;
				Slippage = 0;
				StartBehavior = StartBehavior.WaitUntilFlat;
				TimeInForce = TimeInForce.Gtc;
				TraceOrders = false;
				RealtimeErrorHandling = RealtimeErrorHandling.StopCancelClose;
				StopTargetHandling = StopTargetHandling.PerEntryExecution;
				BarsRequiredToTrade = 0;	// warm-up is handled by the volume history and MinTrainingSessions
				IsInstantiatedOnEachOptimizationIteration = true;

				TimeZoneId = "Eastern Standard Time";
				OpenHour = 9;
				OpenMinute = 30;
				OpenLengthMinutes = 5;

				Lookback = 20;
				UseMedian = false;
				StrongPct = 50;
				LowRvol = 1.0;

				Mode = NyoMode.Rules;
				RulesStrongOnly = false;
				FadeLowVolume = false;
				MinExpectedR = 0.2;
				AllowFade = false;
				MinTrainingSessions = 60;

				KnnK = 25;
				TrainingWindow = 500;
				MinPerBucket = 20;
				LogisticEpochs = 5;
				LogisticRate = 0.05;
				LogisticL2 = 0.01;
				RCap = 5;

				Quantity = 1;
				StopAtCandleExtreme = true;
				StopRangeMultiple = 1.0;
				StopBufferTicks = 2;
				MinStopTicks = 20;
				TargetR = 0;
				ExitMinutesAfterOpen = 390;
				MinMove = 0;

				PrintReport = true;
				CsvFile = "";
				DrawOnChart = true;
			}
			else if (State == State.DataLoaded)
			{
				nyZone = NyoTime.Find(TimeZoneId);
				ntZone = NinjaTrader.Core.Globals.GeneralOptions.TimeZoneInfo;
				barMinutes = BarsPeriod.BarsPeriodType == BarsPeriodType.Minute ? BarsPeriod.Value : 0;
				badTimeframe = barMinutes <= 0 || barMinutes > OpenLengthMinutes || OpenLengthMinutes % barMinutes != 0;
				if (badTimeframe)
					Log("NYOpenVolumeStrategy: use a 1-minute or 5-minute chart (minute bars that divide the opening candle). Nothing will trade.", LogLevel.Error);

				NyoSettings s = new NyoSettings();
				s.OpenHour = OpenHour;
				s.OpenMinute = OpenMinute;
				s.OpenLengthMinutes = OpenLengthMinutes;
				s.Lookback = Lookback;
				s.UseMedian = UseMedian;
				s.StrongPct = StrongPct;
				s.LowRvol = LowRvol;
				s.Checkpoint1 = Math.Min(60, ExitMinutesAfterOpen);
				s.Checkpoint2 = ExitMinutesAfterOpen;
				s.MinMove = MinMove;
				s.StopAtCandleExtreme = StopAtCandleExtreme;
				s.StopRangeMultiple = StopRangeMultiple;
				s.TargetR = TargetR;
				s.StopBuffer = StopBufferTicks * TickSize;
				s.MinStopDistance = Math.Max(1, MinStopTicks) * TickSize;

				NyoPolicy p = new NyoPolicy();
				p.Mode = Mode;
				p.RulesStrongOnly = RulesStrongOnly;
				p.FadeLowVolume = FadeLowVolume;
				p.MinExpectedR = MinExpectedR;
				p.AllowFade = AllowFade;
				p.MinTrainingSessions = MinTrainingSessions;
				p.Learner = NyoPolicy.CreateLearner(Mode, MinPerBucket, KnnK, TrainingWindow, LogisticEpochs, LogisticRate, LogisticL2, RCap);

				runner = new NyoRunner(new NyoEngine(s), p);
				font = new SimpleFont("Arial", 10);
			}
			else if (State == State.Terminated)
			{
				if (runner != null && runner.Engine.Sessions.Count > 0)
				{
					if (PrintReport)
						Print(Report());
					if (!string.IsNullOrEmpty(CsvFile))
						WriteCsv();
				}
			}
		}

		protected override void OnBarUpdate()
		{
			if (BarsInProgress != 0 || runner == null || badTimeframe)
				return;

			DateTime endNy = NyoTime.Convert(Time[0], ntZone, nyZone);
			DateTime startNy = endNy.AddMinutes(-barMinutes);
			runner.OnBar(startNy, endNy, Open[0], High[0], Low[0], Close[0], Volume[0]);

			// Time exit (checkpoint 2)
			if (Position.MarketPosition != MarketPosition.Flat && exitAtNy != DateTime.MinValue && endNy >= exitAtNy)
			{
				if (Position.MarketPosition == MarketPosition.Long)
					ExitLong("NYO time", SignalName);
				else
					ExitShort("NYO time", SignalName);
				exitAtNy = DateTime.MinValue;
			}

			NyoSession x = runner.Decision;
			if (x == null)
				return;
			if (x.Action != 0 && Position.MarketPosition == MarketPosition.Flat)
				Enter(x);
			if (DrawOnChart)
				DrawDecision(x);
		}

		private void Enter(NyoSession x)
		{
			int dir = x.Dir * x.Action;
			double stopDist = runner.Engine.StopDistance(x, dir);
			int stopTicks = Math.Max(1, (int)Math.Round(stopDist / TickSize, MidpointRounding.AwayFromZero));
			SetStopLoss(SignalName, CalculationMode.Ticks, stopTicks, false);
			if (TargetR > 0)
				SetProfitTarget(SignalName, CalculationMode.Ticks, Math.Max(1, (int)Math.Round(TargetR * stopTicks, MidpointRounding.AwayFromZero)));
			exitAtNy = x.End2;
			if (dir > 0)
				EnterLong(Quantity, SignalName);
			else
				EnterShort(Quantity, SignalName);
		}

		private void DrawDecision(NyoSession x)
		{
			string txt;
			if (Mode == NyoMode.Rules || double.IsNaN(x.RFollow))
				txt = x.Reading;
			else
				txt = runner.Policy.Learner.Name + " · seguir " + NyoFormat.Signed(x.RFollow, "0.00") + "R (" + NyoFormat.Num(100 * x.PFollow, "0") + "%)"
					+ (AllowFade ? "\ncontra " + NyoFormat.Signed(x.RFade, "0.00") + "R (" + NyoFormat.Num(100 * x.PFade, "0") + "%)" : "");
			int dir = x.Dir * x.Action;
			txt += dir > 0 ? "\n→ LONG" : dir < 0 ? "\n→ SHORT" : "\n→ sin trade";
			Brush brush = dir > 0 ? Brushes.SeaGreen : dir < 0 ? Brushes.IndianRed : Brushes.Gray;
			bool below = x.Dir < 0;
			Draw.Text(this, "nyo" + x.Date.ToString("yyyyMMdd", CultureInfo.InvariantCulture), false, txt, 0,
				below ? Low[0] - 6 * TickSize : High[0] + 6 * TickSize, below ? -25 : 25,
				brush, font, TextAlignment.Center, Brushes.Transparent, Brushes.Transparent, 0);
		}

		private string Report()
		{
			NyoEngine e = runner.Engine;
			StringBuilder sb = new StringBuilder();
			sb.AppendLine();
			sb.AppendLine("═══ NYOpenVolumeStrategy · " + Instrument.FullName + " · " + BarsPeriod.Value + " min · mode " + Mode + " ═══");
			NyoSession first = e.Sessions[0], last = e.Sessions[e.Sessions.Count - 1];
			sb.AppendLine("Sessions " + first.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) + " → " + last.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
				+ " · opening candles " + e.Sessions.Count + " · measured " + e.Total().N + (e.HasVolume ? "" : " · WARNING: no volume in this data"));
			sb.AppendLine("Shadow trades: entry at the candle close, stop " + (StopAtCandleExtreme ? "beyond the candle extreme" : StopRangeMultiple.ToString("0.##", CultureInfo.InvariantCulture) + "x range")
				+ (TargetR > 0 ? ", target " + TargetR.ToString("0.##", CultureInfo.InvariantCulture) + "R" : ", no target")
				+ ", exit " + NyoFormat.HM(e.Settings, ExitMinutesAfterOpen) + " NY");
			sb.AppendLine();
			sb.Append(NyoReport.HistoryTable(e, true));
			sb.AppendLine();
			sb.Append(NyoReport.PolicySummary(runner.Policy, runner.Score));
			sb.AppendLine("Real fills, commissions and slippage: see the Strategy Analyzer results.");
			return sb.ToString();
		}

		private void WriteCsv()
		{
			try
			{
				string path = Path.IsPathRooted(CsvFile) ? CsvFile : Path.Combine(NinjaTrader.Core.Globals.UserDataDir, CsvFile);
				StringBuilder sb = new StringBuilder();
				sb.AppendLine(NyoReport.CsvHeader());
				foreach (NyoSession x in runner.Engine.Sessions)
					sb.AppendLine(NyoReport.CsvRow(x));
				File.WriteAllText(path, sb.ToString());
				Print("NYOpenVolumeStrategy: " + runner.Engine.Sessions.Count + " sessions written to " + path);
			}
			catch (Exception ex)
			{
				Print("NYOpenVolumeStrategy: could not write the CSV: " + ex.Message);
			}
		}

		#region Properties
		// ─────────────── 1 · Opening candle ───────────────
		[NinjaScriptProperty]
		[Display(Name = "Time zone (Windows id)", Description = "Time zone of the open. Eastern Standard Time = New York, daylight saving included.", Order = 1, GroupName = "1 · Opening candle")]
		public string TimeZoneId { get; set; }

		[NinjaScriptProperty]
		[Range(0, 23)]
		[Display(Name = "Hour", Order = 2, GroupName = "1 · Opening candle")]
		public int OpenHour { get; set; }

		[NinjaScriptProperty]
		[Range(0, 59)]
		[Display(Name = "Minute", Order = 3, GroupName = "1 · Opening candle")]
		public int OpenMinute { get; set; }

		[NinjaScriptProperty]
		[Range(1, 60)]
		[Display(Name = "Candle length (min)", Order = 4, GroupName = "1 · Opening candle")]
		public int OpenLengthMinutes { get; set; }

		// ─────────────── 2 · Volume ───────────────
		[NinjaScriptProperty]
		[Range(3, 250)]
		[Display(Name = "Previous sessions", Description = "How many previous opening candles form the volume base.", Order = 1, GroupName = "2 · Volume vs previous sessions")]
		public int Lookback { get; set; }

		[NinjaScriptProperty]
		[Display(Name = "Compare against median", Description = "false = mean (Pine 'Media'), true = median.", Order = 2, GroupName = "2 · Volume vs previous sessions")]
		public bool UseMedian { get; set; }

		[NinjaScriptProperty]
		[Range(0, double.MaxValue)]
		[Display(Name = "Very high if above base by +%", Order = 3, GroupName = "2 · Volume vs previous sessions")]
		public double StrongPct { get; set; }

		[NinjaScriptProperty]
		[Range(0.1, double.MaxValue)]
		[Display(Name = "Below base if RVOL <", Description = "RVOL = today's volume / base. 1.0 = exactly the base.", Order = 4, GroupName = "2 · Volume vs previous sessions")]
		public double LowRvol { get; set; }

		// ─────────────── 3 · Decision ───────────────
		[NinjaScriptProperty]
		[Display(Name = "Mode", Description = "Rules = the Pine hypothesis. Buckets / Knn / Logistic = learn from past sessions.", Order = 1, GroupName = "3 · Decision")]
		public NyoMode Mode { get; set; }

		[NinjaScriptProperty]
		[Display(Name = "Rules: very high volume only", Order = 2, GroupName = "3 · Decision")]
		public bool RulesStrongOnly { get; set; }

		[NinjaScriptProperty]
		[Display(Name = "Rules: fade below-base volume", Description = "Trade against the candle when volume is below the base (the AMBIGUA / CONTRARIA reading).", Order = 3, GroupName = "3 · Decision")]
		public bool FadeLowVolume { get; set; }

		[NinjaScriptProperty]
		[Range(-5.0, 10.0)]
		[Display(Name = "Learned: min expected R", Description = "Trade only when the learner expects at least this many R.", Order = 4, GroupName = "3 · Decision")]
		public double MinExpectedR { get; set; }

		[NinjaScriptProperty]
		[Display(Name = "Learned: allow fades", Description = "Also trade against the candle when that is what the learner expects to pay.", Order = 5, GroupName = "3 · Decision")]
		public bool AllowFade { get; set; }

		[NinjaScriptProperty]
		[Range(0, int.MaxValue)]
		[Display(Name = "Learned: min training sessions", Description = "No trades until the learner has seen this many finished sessions.", Order = 6, GroupName = "3 · Decision")]
		public int MinTrainingSessions { get; set; }

		// ─────────────── 4 · Learner ───────────────
		[NinjaScriptProperty]
		[Range(1, 500)]
		[Display(Name = "KNN: neighbours (k)", Order = 1, GroupName = "4 · Learner")]
		public int KnnK { get; set; }

		[NinjaScriptProperty]
		[Range(10, 10000)]
		[Display(Name = "Training window (sessions)", Description = "KNN and Logistic only remember the most recent N sessions.", Order = 2, GroupName = "4 · Learner")]
		public int TrainingWindow { get; set; }

		[NinjaScriptProperty]
		[Range(1, 1000)]
		[Display(Name = "Buckets: min sessions per bucket", Order = 3, GroupName = "4 · Learner")]
		public int MinPerBucket { get; set; }

		[NinjaScriptProperty]
		[Range(1, 100)]
		[Display(Name = "Logistic: passes per session", Order = 4, GroupName = "4 · Learner")]
		public int LogisticEpochs { get; set; }

		[NinjaScriptProperty]
		[Range(0.0001, 1.0)]
		[Display(Name = "Logistic: learning rate", Order = 5, GroupName = "4 · Learner")]
		public double LogisticRate { get; set; }

		[NinjaScriptProperty]
		[Range(0.0, 1.0)]
		[Display(Name = "Logistic: L2 penalty", Order = 6, GroupName = "4 · Learner")]
		public double LogisticL2 { get; set; }

		[NinjaScriptProperty]
		[Range(1.0, 100.0)]
		[Display(Name = "Clip R at", Description = "Big winners are clipped to this many R when learning so one outlier day does not dominate.", Order = 7, GroupName = "4 · Learner")]
		public double RCap { get; set; }

		// ─────────────── 5 · Trade ───────────────
		[NinjaScriptProperty]
		[Range(1, int.MaxValue)]
		[Display(Name = "Quantity", Order = 1, GroupName = "5 · Trade")]
		public int Quantity { get; set; }

		[NinjaScriptProperty]
		[Display(Name = "Stop beyond the candle extreme", Description = "true: long stop under the candle low, short stop over the candle high. false: stop = range multiple x candle range.", Order = 2, GroupName = "5 · Trade")]
		public bool StopAtCandleExtreme { get; set; }

		[NinjaScriptProperty]
		[Range(0.1, 20.0)]
		[Display(Name = "Stop range multiple", Order = 3, GroupName = "5 · Trade")]
		public double StopRangeMultiple { get; set; }

		[NinjaScriptProperty]
		[Range(0, int.MaxValue)]
		[Display(Name = "Stop buffer (ticks)", Order = 4, GroupName = "5 · Trade")]
		public int StopBufferTicks { get; set; }

		[NinjaScriptProperty]
		[Range(1, int.MaxValue)]
		[Display(Name = "Min stop (ticks)", Order = 5, GroupName = "5 · Trade")]
		public int MinStopTicks { get; set; }

		[NinjaScriptProperty]
		[Range(0.0, 50.0)]
		[Display(Name = "Target (R, 0 = none)", Order = 6, GroupName = "5 · Trade")]
		public double TargetR { get; set; }

		[NinjaScriptProperty]
		[Range(5, 1440)]
		[Display(Name = "Exit minutes after open", Description = "Time exit. 60 = 10:30, 390 = 16:00 NY.", Order = 7, GroupName = "5 · Trade")]
		public int ExitMinutesAfterOpen { get; set; }

		[NinjaScriptProperty]
		[Range(0.0, 20.0)]
		[Display(Name = "Min move for SIGUE (x range)", Description = "Only for the SIGUE / AMBIGUA / CONTRARIA table, like the Pine input.", Order = 8, GroupName = "5 · Trade")]
		public double MinMove { get; set; }

		// ─────────────── 6 · Output ───────────────
		[Display(Name = "Print report", Description = "Report in the NinjaScript Output window when the strategy stops. Turn off while optimizing.", Order = 1, GroupName = "6 · Output")]
		public bool PrintReport { get; set; }

		[Display(Name = "CSV file (empty = off)", Description = "One row per session with features, predictions and outcomes. Relative paths go to Documents\\NinjaTrader 8.", Order = 2, GroupName = "6 · Output")]
		public string CsvFile { get; set; }

		[Display(Name = "Draw decisions on chart", Order = 3, GroupName = "6 · Output")]
		public bool DrawOnChart { get; set; }
		#endregion
	}
}
