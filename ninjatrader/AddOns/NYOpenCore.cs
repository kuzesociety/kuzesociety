#region Using declarations
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
#endregion

// ═══════════════════════════════════════════════════════════════════════════
//  NY OPEN · shared logic for the NYOpenVolumenZonas indicator and the
//  NYOpenVolumeStrategy.
//
//  Pure C# on purpose: no NinjaTrader types are used here, so the exact same
//  file is compiled by NinjaTrader and by the unit tests in /ninjatrader/tests.
//
//  Every time passed in is New York time and describes a CLOSED bar:
//      barStart = open time of the bar, barEnd = close time of the bar.
//  (NinjaTrader stamps minute bars with their close time; the callers convert.)
//
//  Written in C# 5 syntax so it compiles with any NinjaTrader 8 version.
// ═══════════════════════════════════════════════════════════════════════════
namespace NinjaTrader.NinjaScript.AddOns.NYOpen
{
	public enum NyoOutcome
	{
		None,
		Sigue,
		Ambigua,
		Contraria
	}

	public enum NyoZoneExtend
	{
		UntilCrossed,
		FixedHours,
		Always
	}

	// ─────────────────────────── Settings ───────────────────────────
	public sealed class NyoSettings
	{
		// 1 · Opening candle
		public int OpenHour = 9;
		public int OpenMinute = 30;
		public int OpenLengthMinutes = 5;

		// 2 · Volume vs previous sessions
		public int Lookback = 20;
		public bool UseMedian = false;
		public double StrongPct = 50.0;
		public double LowRvol = 1.0;

		// 3 · Did it follow through? (minutes from the open)
		public int Checkpoint1 = 60;
		public int Checkpoint2 = 390;
		public double MinMove = 0.0;

		// Shadow trades (what the learners learn from): enter at the candle close,
		// exit at checkpoint 2 unless the stop or the target is hit first.
		public bool StopAtCandleExtreme = true;	// true: stop beyond the other side of the candle · false: StopRangeMultiple x range
		public double StopRangeMultiple = 1.0;
		public double TargetR = 0.0;			// target in multiples of the stop distance, 0 = no target
		public double StopBuffer = 0.0;			// extra distance beyond the candle extreme (price units)
		public double MinStopDistance = 0.0;	// price units

		// Regular session length, used to find the previous day's close (390 = 09:30 → 16:00)
		public int SessionLengthMinutes = 390;

		public double StrongRvol { get { return 1.0 + StrongPct / 100.0; } }

		public int NeedHistory { get { return Math.Max(3, (int)Math.Round(Lookback / 2.0, MidpointRounding.AwayFromZero)); } }

		public int FirstCheckpoint { get { return Math.Min(Checkpoint1, Checkpoint2); } }

		public int LastCheckpoint { get { return Math.Max(Checkpoint1, Checkpoint2); } }
	}

	// ─────────────────────────── Shadow trade ───────────────────────────
	// A hypothetical trade opened at the candle close. Used to label sessions for the
	// learners and to report what each volume bucket would have paid in R.
	public sealed class NyoShadowTrade
	{
		public int Dir;
		public double Entry;
		public double StopDistance;
		public double TargetDistance;	// 0 = no target
		public double R = double.NaN;
		public bool Exited;
		public string ExitReason = "";

		public double StopPrice { get { return Entry - Dir * StopDistance; } }

		public double TargetPrice { get { return TargetDistance > 0 ? Entry + Dir * TargetDistance : double.NaN; } }

		public bool Win { get { return !double.IsNaN(R) && R > 0; } }

		// Stop is checked before target: if one bar touches both we assume the worst.
		public void Update(double o, double h, double l)
		{
			if (Exited || StopDistance <= 0)
				return;
			double stop = StopPrice;
			bool stopHit = Dir > 0 ? l <= stop : h >= stop;
			if (stopHit)
			{
				bool gapped = Dir > 0 ? o <= stop : o >= stop;
				Close(gapped ? o : stop, "stop");
				return;
			}
			if (TargetDistance > 0)
			{
				double target = TargetPrice;
				bool targetHit = Dir > 0 ? h >= target : l <= target;
				if (targetHit)
				{
					bool gapped = Dir > 0 ? o >= target : o <= target;
					Close(gapped ? o : target, "target");
				}
			}
		}

		public void Close(double price, string reason)
		{
			if (Exited || StopDistance <= 0)
				return;
			R = (price - Entry) * Dir / StopDistance;
			Exited = true;
			ExitReason = reason;
		}
	}

	// ─────────────────────────── Session ───────────────────────────
	// One NY opening candle and everything measured about it.
	public sealed class NyoSession
	{
		public DateTime Date;
		public DateTime WindowStart;
		public DateTime WindowEnd;
		public DateTime FirstBarEnd;
		public DateTime LastBarEnd;

		public double Open;
		public double High;
		public double Low;
		public double Close;
		public double Volume;
		public int Dir;
		public double Range;

		// Volume vs previous sessions (NaN while warming up / no volume)
		public int HistoryCount;
		public double Base = double.NaN;
		public double Rvol = double.NaN;
		public double ZScore = double.NaN;
		public double Percentile = double.NaN;
		public int Bucket = -1;	// 0 = very high, 1 = above base, 2 = below base, -1 = not measurable
		public string Reading = "";

		// Features known at the candle close (see NyoFeatures)
		public double[] Features = new double[NyoFeatures.Count];
		public bool FeaturesValid;

		// Follow-through tracking
		public DateTime End1;
		public DateTime End2;
		public double C1 = double.NaN;
		public double C2 = double.NaN;
		public DateTime T2;
		public bool Settled;
		public bool Sig1;
		public NyoOutcome Outcome = NyoOutcome.None;
		public double MoveR = double.NaN;	// move from the candle close at checkpoint 2, in candle ranges, signed with the candle

		public NyoShadowTrade Follow;	// trade in the candle's direction
		public NyoShadowTrade Fade;		// trade against it

		// Filled in by the policy at the candle close (NaN = no prediction)
		public double PFollow = double.NaN;	// chance that following the candle wins
		public double RFollow = double.NaN;	// expected R of following it
		public double PFade = double.NaN;
		public double RFade = double.NaN;
		public bool Decided;				// the policy was able to decide on this session
		public int Action;					// +1 followed, -1 faded, 0 no trade

		public bool Measurable { get { return Bucket >= 0; } }
	}

	// ─────────────────────────── Features ───────────────────────────
	// What the learners look at. All of it is known at 09:35, nothing from the future.
	public static class NyoFeatures
	{
		public const int Count = 7;

		public static readonly string[] Names =
		{
			"dir",				// +1 bullish candle, -1 bearish
			"log_rvol",			// ln(volume / base)
			"log_rel_range",	// ln(candle range / average opening-candle range)
			"body",				// |close - open| / range
			"close_loc",		// 1 = closed right at the extreme in its direction, 0 = at the opposite extreme
			"gap",				// (09:30 open - previous 16:00 close) / average day move, signed with the candle
			"prev_day"			// (previous close - previous open) / average day move, signed with the candle
		};
	}

	// ─────────────────────────── Bucket stats (historical table) ───────────────────────────
	public sealed class NyoBucketStats
	{
		public int N;
		public int Sig1;
		public int Sig2;
		public int Amb2;
		public int Con2;
		public readonly List<double> Moves = new List<double>();
		public int FollowTrades;
		public int FollowWins;
		public double FollowRSum;
		public int FadeTrades;
		public int FadeWins;
		public double FadeRSum;

		public void Add(NyoSession x)
		{
			N++;
			if (x.Sig1)
				Sig1++;
			if (x.Outcome == NyoOutcome.Sigue)
				Sig2++;
			else if (x.Outcome == NyoOutcome.Contraria)
				Con2++;
			else
				Amb2++;
			if (!double.IsNaN(x.MoveR))
				Moves.Add(x.MoveR);
			if (x.Follow != null && !double.IsNaN(x.Follow.R))
			{
				FollowTrades++;
				FollowRSum += x.Follow.R;
				if (x.Follow.Win)
					FollowWins++;
			}
			if (x.Fade != null && !double.IsNaN(x.Fade.R))
			{
				FadeTrades++;
				FadeRSum += x.Fade.R;
				if (x.Fade.Win)
					FadeWins++;
			}
		}

		public void AddAll(NyoBucketStats o)
		{
			N += o.N;
			Sig1 += o.Sig1;
			Sig2 += o.Sig2;
			Amb2 += o.Amb2;
			Con2 += o.Con2;
			Moves.AddRange(o.Moves);
			FollowTrades += o.FollowTrades;
			FollowWins += o.FollowWins;
			FollowRSum += o.FollowRSum;
			FadeTrades += o.FadeTrades;
			FadeWins += o.FadeWins;
			FadeRSum += o.FadeRSum;
		}

		public double MedianMove { get { return NyoMath.Median(Moves); } }

		public double FollowAvgR { get { return FollowTrades > 0 ? FollowRSum / FollowTrades : double.NaN; } }

		public double FadeAvgR { get { return FadeTrades > 0 ? FadeRSum / FadeTrades : double.NaN; } }
	}

	// ─────────────────────────── Engine ───────────────────────────
	// Port of section 1 of the Pine script: builds the opening candle, compares its volume
	// with the same candle of the previous sessions and measures whether price followed.
	public sealed class NyoEngine
	{
		private readonly NyoSettings s;
		private readonly List<double> volHist = new List<double>();
		private readonly List<double> rangeHist = new List<double>();
		private readonly List<double> dayMoveHist = new List<double>();
		private readonly NyoBucketStats[] buckets = { new NyoBucketStats(), new NyoBucketStats(), new NyoBucketStats() };
		private readonly List<NyoSession> sessions = new List<NyoSession>();

		private bool hasVolume;
		private bool prevInWin;
		private NyoSession building;
		private NyoSession tracking;

		// Regular-session open/close of the current and the previous day (for the gap / previous-day features)
		private DateTime todayWinS = DateTime.MinValue;
		private double todayOpen = double.NaN;
		private double todayClose = double.NaN;
		private double prevOpen = double.NaN;
		private double prevClose = double.NaN;

		public NyoEngine(NyoSettings settings)
		{
			s = settings;
		}

		public NyoSettings Settings { get { return s; } }

		public bool HasVolume { get { return hasVolume; } }

		public NyoBucketStats[] Buckets { get { return buckets; } }

		// Every opening candle seen, oldest first
		public List<NyoSession> Sessions { get { return sessions; } }

		// Most recent opening candle (the "today" table)
		public NyoSession Last { get { return sessions.Count > 0 ? sessions[sessions.Count - 1] : null; } }

		// Set only on the bar where it happened, null otherwise
		public NyoSession CandleClosed { get; private set; }

		public NyoSession JustSettled { get; private set; }

		public NyoSession Tracking { get { return tracking; } }

		public void OnBar(DateTime barStart, DateTime barEnd, double o, double h, double l, double c, double v)
		{
			CandleClosed = null;
			JustSettled = null;

			if (!double.IsNaN(v) && v > 0)
				hasVolume = true;

			DateTime winS = barStart.Date.AddHours(s.OpenHour).AddMinutes(s.OpenMinute);
			DateTime winE = winS.AddMinutes(s.OpenLengthMinutes);
			bool inWin = barStart >= winS && barStart < winE;
			bool winFirst = inWin && !prevInWin;
			bool winLast = inWin && barEnd >= winE;
			prevInWin = inWin;

			// Follow-through of the session in progress
			if (tracking != null)
			{
				if (barStart >= tracking.End2 || winFirst)
					Settle();
				else
				{
					if (barEnd <= tracking.End1)
						tracking.C1 = c;
					if (barEnd <= tracking.End2)
					{
						tracking.C2 = c;
						tracking.T2 = barEnd;
						tracking.Follow.Update(o, h, l);
						tracking.Fade.Update(o, h, l);
					}
					if (barEnd >= tracking.End2)
						Settle();
				}
			}

			// Opening candle (built from 1m or 5m bars)
			if (winFirst)
			{
				RollDay(winS, o);
				building = new NyoSession();
				building.Date = winS.Date;
				building.WindowStart = winS;
				building.WindowEnd = winE;
				building.FirstBarEnd = barEnd;
				building.Open = o;
				building.High = h;
				building.Low = l;
				building.Volume = 0;
			}
			if (inWin && building != null)
			{
				building.High = Math.Max(building.High, h);
				building.Low = Math.Min(building.Low, l);
				building.Close = c;
				building.LastBarEnd = barEnd;
				if (!double.IsNaN(v))
					building.Volume += v;
			}

			// Regular-session close of today (last close at or before 16:00)
			if (todayWinS != DateTime.MinValue && barEnd > todayWinS && barEnd <= todayWinS.AddMinutes(s.SessionLengthMinutes))
				todayClose = c;

			if (winLast && building != null)
				CompleteCandle();
		}

		private void RollDay(DateTime winS, double open)
		{
			if (!double.IsNaN(todayOpen) && !double.IsNaN(todayClose))
			{
				prevOpen = todayOpen;
				prevClose = todayClose;
				Push(dayMoveHist, Math.Abs(prevClose - prevOpen), s.Lookback);
			}
			else
			{
				prevOpen = double.NaN;
				prevClose = double.NaN;
			}
			todayWinS = winS;
			todayOpen = open;
			todayClose = double.NaN;
		}

		private void CompleteCandle()
		{
			NyoSession x = building;
			building = null;
			if (tracking != null)
				Settle();

			x.Range = x.High - x.Low;
			x.Dir = x.Close > x.Open ? 1 : x.Close < x.Open ? -1 : 0;

			int hs = volHist.Count;
			x.HistoryCount = hs;
			if (hasVolume && hs >= s.NeedHistory)
			{
				double mean = NyoMath.Mean(volHist);
				x.Base = s.UseMedian ? NyoMath.Median(volHist) : mean;
				double sd = NyoMath.PopStdev(volHist);
				x.ZScore = sd > 0 ? (x.Volume - mean) / sd : double.NaN;
				int below = 0;
				foreach (double hv in volHist)
					if (hv < x.Volume)
						below++;
				x.Percentile = 100.0 * below / hs;
			}
			x.Rvol = !double.IsNaN(x.Base) && x.Base > 0 ? x.Volume / x.Base : double.NaN;
			x.Bucket = double.IsNaN(x.Rvol) || x.Dir == 0 ? -1 : x.Rvol >= s.StrongRvol ? 0 : x.Rvol >= s.LowRvol ? 1 : 2;
			x.Reading = Reading(x.Rvol, x.Dir, hs, s.NeedHistory, hasVolume, s.StrongRvol, s.LowRvol);

			ComputeFeatures(x);

			// today's candle joins the history only after being compared with it
			Push(volHist, x.Volume, s.Lookback);
			Push(rangeHist, x.Range, s.Lookback);

			x.End1 = x.WindowStart.AddMinutes(s.FirstCheckpoint);
			x.End2 = x.WindowStart.AddMinutes(s.LastCheckpoint);
			x.T2 = x.LastBarEnd;
			if (x.Measurable)
			{
				x.Follow = MakeShadow(x, x.Dir);
				x.Fade = MakeShadow(x, -x.Dir);
				tracking = x;
			}

			sessions.Add(x);
			CandleClosed = x;
		}

		private void ComputeFeatures(NyoSession x)
		{
			double[] f = x.Features;
			double avgRange = NyoMath.Mean(rangeHist);
			double avgDay = NyoMath.Mean(dayMoveHist);
			f[0] = x.Dir;
			f[1] = x.Rvol > 0 ? Math.Log(x.Rvol) : double.NaN;
			f[2] = avgRange > 0 && x.Range > 0 ? Math.Log(x.Range / avgRange) : double.NaN;
			f[3] = x.Range > 0 ? Math.Abs(x.Close - x.Open) / x.Range : double.NaN;
			f[4] = x.Range > 0 ? (x.Dir >= 0 ? (x.Close - x.Low) / x.Range : (x.High - x.Close) / x.Range) : double.NaN;
			f[5] = avgDay > 0 && !double.IsNaN(prevClose) ? Clamp((x.Open - prevClose) * x.Dir / avgDay, -4, 4) : double.NaN;
			f[6] = avgDay > 0 && !double.IsNaN(prevClose) ? Clamp((prevClose - prevOpen) * x.Dir / avgDay, -4, 4) : double.NaN;

			bool ok = x.Dir != 0;
			for (int i = 0; i < f.Length; i++)
				if (double.IsNaN(f[i]) || double.IsInfinity(f[i]))
					ok = false;
			x.FeaturesValid = ok;
		}

		public NyoShadowTrade MakeShadow(NyoSession x, int tradeDir)
		{
			NyoShadowTrade t = new NyoShadowTrade();
			t.Dir = tradeDir;
			t.Entry = x.Close;
			t.StopDistance = StopDistance(x, tradeDir);
			t.TargetDistance = s.TargetR > 0 ? s.TargetR * t.StopDistance : 0;
			return t;
		}

		// Distance from the candle close to the stop for a trade in tradeDir.
		public double StopDistance(NyoSession x, int tradeDir)
		{
			double d;
			if (s.StopAtCandleExtreme)
				d = (tradeDir > 0 ? x.Close - x.Low : x.High - x.Close) + s.StopBuffer;
			else
				d = s.StopRangeMultiple * x.Range;
			return Math.Max(d, Math.Max(s.MinStopDistance, 1e-9));
		}

		// Did it follow, stay ambiguous or go against? (Pine: method settle)
		private void Settle()
		{
			NyoSession t = tracking;
			tracking = null;
			if (t == null || double.IsNaN(t.C2))
				return;

			double need = s.MinMove * t.Range;
			t.Sig1 = !double.IsNaN(t.C1) && (t.C1 - t.Close) * t.Dir > need;
			double mv = (t.C2 - t.Close) * t.Dir;
			bool sigue = mv > need;
			bool contra = !sigue && (t.Dir > 0 ? t.C2 < t.Low : t.C2 > t.High);
			t.Outcome = sigue ? NyoOutcome.Sigue : contra ? NyoOutcome.Contraria : NyoOutcome.Ambigua;
			t.MoveR = t.Range > 0 ? mv / t.Range : double.NaN;
			t.Follow.Close(t.C2, "time");
			t.Fade.Close(t.C2, "time");
			t.Settled = true;

			buckets[t.Bucket].Add(t);
			JustSettled = t;
		}

		// Where price is now relative to today's candle (the "Ahora" row)
		public NyoOutcome Classify(NyoSession x, double price, out double moveR)
		{
			moveR = double.NaN;
			if (x == null || x.Dir == 0 || x.Range <= 0)
				return NyoOutcome.None;
			double mv = (price - x.Close) * x.Dir;
			moveR = mv / x.Range;
			if (mv > s.MinMove * x.Range)
				return NyoOutcome.Sigue;
			if (x.Dir > 0 ? price < x.Low : price > x.High)
				return NyoOutcome.Contraria;
			return NyoOutcome.Ambigua;
		}

		public NyoBucketStats Total()
		{
			NyoBucketStats all = new NyoBucketStats();
			foreach (NyoBucketStats b in buckets)
				all.AddAll(b);
			return all;
		}

		// Reading according to the hypothesis: volume above the base → follows; below → ambiguous/contrary
		public static string Reading(double rv, int dir, int hs, int need, bool hasVol, double strongRv, double lowRv)
		{
			if (dir == 0)
				return "SIN DIRECCIÓN";
			if (!hasVol)
				return "SIN VOLUMEN";
			if (double.IsNaN(rv))
				return "calentando " + hs + "/" + need;
			if (rv >= strongRv)
				return (dir > 0 ? "SIGUE ▲" : "SIGUE ▼") + " · fuerte";
			if (rv >= lowRv)
				return dir > 0 ? "SIGUE ▲" : "SIGUE ▼";
			return "AMBIGUA / CONTRARIA";
		}

		private static void Push(List<double> list, double v, int max)
		{
			list.Add(v);
			while (list.Count > max)
				list.RemoveAt(0);
		}

		private static double Clamp(double v, double lo, double hi)
		{
			return v < lo ? lo : v > hi ? hi : v;
		}
	}

	// ─────────────────────────── Learners ───────────────────────────
	// A learner looks only at sessions that already finished and estimates, for today's candle:
	//     PFollow / RFollow = chance of winning / expected R when trading WITH the candle
	//     PFade   / RFade   = the same when trading AGAINST it
	// (shadow trades: entry at the candle close, the strategy's stop/target, exit at checkpoint 2).
	// Learn() is called when a session settles, so a prediction never sees its own future.
	public sealed class NyoSample
	{
		public double[] X;
		public bool FollowWin;
		public double FollowR;
		public bool FadeWin;
		public double FadeR;
	}

	public abstract class NyoLearner
	{
		private double rCap = 5.0;

		public abstract string Name { get; }

		public abstract int TrainingCount { get; }

		// Fills PFollow/RFollow/PFade/RFade. false when there is not enough history to say anything.
		public abstract bool Predict(NyoSession x);

		public abstract void Learn(NyoSession x);

		// One trade with a tiny stop that ran 40R would dominate every average, so R is clipped
		// to [-2, RCap] for learning. Reports always use the real R.
		public double RCap
		{
			get { return rCap; }
			set { rCap = Math.Max(1.0, value); }
		}

		public static bool CanPredict(NyoSession x)
		{
			return x != null && x.Measurable && x.FeaturesValid;
		}

		public static bool CanLearn(NyoSession x)
		{
			return CanPredict(x) && x.Settled && x.Follow != null && x.Fade != null && !double.IsNaN(x.Follow.R) && !double.IsNaN(x.Fade.R);
		}

		protected NyoSample ToSample(NyoSession x)
		{
			NyoSample s = new NyoSample();
			s.X = (double[])x.Features.Clone();
			s.FollowWin = x.Follow.Win;
			s.FollowR = Clip(x.Follow.R);
			s.FadeWin = x.Fade.Win;
			s.FadeR = Clip(x.Fade.R);
			return s;
		}

		private double Clip(double r)
		{
			return r < -2 ? -2 : r > rCap ? rCap : r;
		}
	}

	// Running win/R totals of a group of samples
	public sealed class NyoTally
	{
		public int N;
		public int FollowWins;
		public double FollowR;
		public int FadeWins;
		public double FadeR;

		public void Add(NyoSample s)
		{
			N++;
			if (s.FollowWin)
				FollowWins++;
			FollowR += s.FollowR;
			if (s.FadeWin)
				FadeWins++;
			FadeR += s.FadeR;
		}

		// Win chances are smoothed towards 50% (Laplace) so 3 wins out of 3 is not "100%".
		public void Fill(NyoSession x)
		{
			x.PFollow = (FollowWins + 1.0) / (N + 2.0);
			x.RFollow = N > 0 ? FollowR / N : double.NaN;
			x.PFade = (FadeWins + 1.0) / (N + 2.0);
			x.RFade = N > 0 ? FadeR / N : double.NaN;
		}
	}

	// Same idea as the Pine historical table: how the volume bucket has done so far.
	public sealed class NyoBucketLearner : NyoLearner
	{
		private readonly int minPerBucket;
		private readonly NyoTally[] tally = { new NyoTally(), new NyoTally(), new NyoTally() };

		public NyoBucketLearner(int minPerBucket)
		{
			this.minPerBucket = Math.Max(1, minPerBucket);
		}

		public override string Name { get { return "Buckets"; } }

		public override int TrainingCount { get { return tally[0].N + tally[1].N + tally[2].N; } }

		public override bool Predict(NyoSession x)
		{
			if (!CanPredict(x) || tally[x.Bucket].N < minPerBucket)
				return false;
			tally[x.Bucket].Fill(x);
			return true;
		}

		public override void Learn(NyoSession x)
		{
			if (CanLearn(x))
				tally[x.Bucket].Add(ToSample(x));
		}
	}

	// k nearest neighbours: "find the k past openings that looked most like today's, what happened next?"
	public sealed class NyoKnnLearner : NyoLearner
	{
		private readonly int k;
		private readonly int window;
		private readonly List<NyoSample> samples = new List<NyoSample>();

		public NyoKnnLearner(int k, int window)
		{
			this.k = Math.Max(1, k);
			this.window = Math.Max(this.k, window);
		}

		public override string Name { get { return "KNN"; } }

		public override int TrainingCount { get { return samples.Count; } }

		public override bool Predict(NyoSession x)
		{
			if (!CanPredict(x) || samples.Count < k)
				return false;
			List<double[]> xs = new List<double[]>(samples.Count);
			foreach (NyoSample s in samples)
				xs.Add(s.X);
			double[] mean;
			double[] sd;
			NyoMath.ColumnStats(xs, out mean, out sd);
			double[] q = NyoMath.Standardize(x.Features, mean, sd);
			double[] dist = new double[samples.Count];
			int[] idx = new int[samples.Count];
			for (int i = 0; i < samples.Count; i++)
			{
				double[] z = NyoMath.Standardize(xs[i], mean, sd);
				double d = 0;
				for (int j = 0; j < z.Length; j++)
					d += (z[j] - q[j]) * (z[j] - q[j]);
				dist[i] = d;
				idx[i] = i;
			}
			Array.Sort(dist, idx);
			NyoTally t = new NyoTally();
			for (int i = 0; i < k; i++)
				t.Add(samples[idx[i]]);
			t.Fill(x);
			return true;
		}

		public override void Learn(NyoSession x)
		{
			if (!CanLearn(x))
				return;
			samples.Add(ToSample(x));
			while (samples.Count > window)
				samples.RemoveAt(0);
		}
	}

	// Logistic regression (one model for following, one for fading) re-fitted with a few passes
	// over a rolling window after every session. Expected R = p x average win + (1 - p) x average loss.
	public sealed class NyoLogisticLearner : NyoLearner
	{
		private sealed class Logit
		{
			public readonly double[] W = new double[NyoFeatures.Count];
			public double B;

			public double P(double[] z)
			{
				double t = B;
				for (int j = 0; j < W.Length; j++)
					t += W[j] * z[j];
				if (t < -30)
					return 1e-13;
				if (t > 30)
					return 1 - 1e-13;
				return 1.0 / (1.0 + Math.Exp(-t));
			}

			public void Step(double[] z, bool y, double rate, double l2)
			{
				double g = P(z) - (y ? 1.0 : 0.0);
				for (int j = 0; j < W.Length; j++)
					W[j] -= rate * (g * z[j] + l2 * W[j]);
				B -= rate * g;
			}
		}

		private readonly int window;
		private readonly int epochs;
		private readonly double rate;
		private readonly double l2;
		private readonly Logit follow = new Logit();
		private readonly Logit fade = new Logit();
		private readonly List<NyoSample> samples = new List<NyoSample>();
		private double[] mean = new double[NyoFeatures.Count];
		private double[] sd = new double[NyoFeatures.Count];
		private double followWinR, followLossR, fadeWinR, fadeLossR;

		public NyoLogisticLearner(int window, int epochs, double rate, double l2)
		{
			this.window = Math.Max(10, window);
			this.epochs = Math.Max(1, epochs);
			this.rate = rate;
			this.l2 = l2;
		}

		public override string Name { get { return "Logistic"; } }

		public override int TrainingCount { get { return samples.Count; } }

		// Weights of the "follow" model on standardized features (same order as NyoFeatures.Names)
		public double[] FollowWeights { get { return (double[])follow.W.Clone(); } }

		public override bool Predict(NyoSession x)
		{
			if (!CanPredict(x) || samples.Count < 10)
				return false;
			double[] z = NyoMath.Standardize(x.Features, mean, sd);
			x.PFollow = follow.P(z);
			x.RFollow = x.PFollow * followWinR + (1 - x.PFollow) * followLossR;
			x.PFade = fade.P(z);
			x.RFade = x.PFade * fadeWinR + (1 - x.PFade) * fadeLossR;
			return true;
		}

		public override void Learn(NyoSession x)
		{
			if (!CanLearn(x))
				return;
			samples.Add(ToSample(x));
			while (samples.Count > window)
				samples.RemoveAt(0);

			List<double[]> xs = new List<double[]>(samples.Count);
			List<double> fw = new List<double>(), fl = new List<double>(), aw = new List<double>(), al = new List<double>();
			foreach (NyoSample s in samples)
			{
				xs.Add(s.X);
				(s.FollowWin ? fw : fl).Add(s.FollowR);
				(s.FadeWin ? aw : al).Add(s.FadeR);
			}
			NyoMath.ColumnStats(xs, out mean, out sd);
			followWinR = fw.Count > 0 ? NyoMath.Mean(fw) : 0;
			followLossR = fl.Count > 0 ? NyoMath.Mean(fl) : 0;
			fadeWinR = aw.Count > 0 ? NyoMath.Mean(aw) : 0;
			fadeLossR = al.Count > 0 ? NyoMath.Mean(al) : 0;

			for (int e = 0; e < epochs; e++)
				foreach (NyoSample s in samples)
				{
					double[] z = NyoMath.Standardize(s.X, mean, sd);
					follow.Step(z, s.FollowWin, rate, l2);
					fade.Step(z, s.FadeWin, rate, l2);
				}
		}
	}

	// ─────────────────────────── Scoring the policy ───────────────────────────
	// Compares the sessions the policy picked with simply trading every session.
	// Only sessions it decided on BEFORE knowing the outcome are counted.
	public sealed class NyoPredictionScore
	{
		public int Sessions;		// sessions the policy could decide on
		public int FollowWins;		// …following every one of them
		public double FollowR;
		public int FadeWins;		// …fading every one of them
		public double FadeR;
		public int FollowSignals;
		public int FollowSignalWins;
		public double FollowSignalR;
		public int FadeSignals;
		public int FadeSignalWins;
		public double FadeSignalR;
		public int Predictions;
		private int predictionWins;
		private double brier;

		public void Record(NyoSession x)
		{
			if (x == null || !x.Decided || x.Follow == null || x.Fade == null || double.IsNaN(x.Follow.R) || double.IsNaN(x.Fade.R))
				return;
			Sessions++;
			FollowR += x.Follow.R;
			if (x.Follow.Win)
				FollowWins++;
			FadeR += x.Fade.R;
			if (x.Fade.Win)
				FadeWins++;
			if (x.Action > 0)
			{
				FollowSignals++;
				FollowSignalR += x.Follow.R;
				if (x.Follow.Win)
					FollowSignalWins++;
			}
			else if (x.Action < 0)
			{
				FadeSignals++;
				FadeSignalR += x.Fade.R;
				if (x.Fade.Win)
					FadeSignalWins++;
			}
			if (!double.IsNaN(x.PFollow))
			{
				double y = x.Follow.Win ? 1.0 : 0.0;
				Predictions++;
				if (x.Follow.Win)
					predictionWins++;
				brier += (x.PFollow - y) * (x.PFollow - y);
			}
		}

		public static double Avg(double sum, int n)
		{
			return n > 0 ? sum / n : double.NaN;
		}

		// Brier score of the follow win chance. Lower is better.
		public double Brier { get { return Predictions > 0 ? brier / Predictions : double.NaN; } }

		// Brier score of always guessing the average win rate: the learner has to beat this.
		public double BrierBaseline
		{
			get
			{
				if (Predictions == 0)
					return double.NaN;
				double p = (double)predictionWins / Predictions;
				return p * (1 - p);
			}
		}
	}

	// ─────────────────────────── Policy: what to do at 09:35 ───────────────────────────
	public enum NyoMode
	{
		Rules,		// the Pine hypothesis as-is: volume above the base → follow the candle
		Buckets,	// trade what the volume bucket has paid so far
		Knn,		// ask the k most similar past openings
		Logistic	// logistic regression on the features
	}

	public sealed class NyoPolicy
	{
		public NyoMode Mode = NyoMode.Rules;

		// Rules mode
		public bool RulesStrongOnly = false;	// follow only "very high" volume
		public bool FadeLowVolume = false;		// trade against the candle when volume is below the base

		// Learned modes
		public double MinExpectedR = 0.2;		// trade only when the learner expects at least this many R
		public bool AllowFade = false;			// also allow trades against the candle
		public int MinTrainingSessions = 60;	// no trades until the learner has seen this many sessions

		public NyoLearner Learner;

		public static NyoLearner CreateLearner(NyoMode mode, int minPerBucket, int knnK, int window, int logEpochs, double logRate, double logL2, double rCap)
		{
			NyoLearner l;
			switch (mode)
			{
				case NyoMode.Buckets: l = new NyoBucketLearner(minPerBucket); break;
				case NyoMode.Knn: l = new NyoKnnLearner(knnK, window); break;
				case NyoMode.Logistic: l = new NyoLogisticLearner(window, logEpochs, logRate, logL2); break;
				default: return null;
			}
			l.RCap = rCap;
			return l;
		}

		// +1 follow the candle, -1 fade it, 0 stay out. Stores the prediction on the session.
		public int Decide(NyoSession x)
		{
			if (x == null || !x.Measurable)
				return 0;

			if (Mode == NyoMode.Rules || Learner == null)
			{
				x.Decided = true;
				if (x.Bucket == 0 || (x.Bucket == 1 && !RulesStrongOnly))
					return 1;
				if (x.Bucket == 2 && FadeLowVolume)
					return -1;
				return 0;
			}

			if (Learner.TrainingCount < MinTrainingSessions || !Learner.Predict(x))
				return 0;
			x.Decided = true;
			bool follow = x.RFollow >= MinExpectedR;
			bool fade = AllowFade && x.RFade >= MinExpectedR;
			if (follow && (!fade || x.RFollow >= x.RFade))
				return 1;
			if (fade)
				return -1;
			return 0;
		}
	}

	// Engine + policy + learner wired in the only safe order:
	// learn from the session that just finished, THEN decide on the candle that just closed.
	public sealed class NyoRunner
	{
		private readonly NyoEngine engine;
		private readonly NyoPolicy policy;
		private readonly NyoPredictionScore score = new NyoPredictionScore();

		public NyoRunner(NyoEngine engine, NyoPolicy policy)
		{
			this.engine = engine;
			this.policy = policy;
		}

		public NyoEngine Engine { get { return engine; } }

		public NyoPolicy Policy { get { return policy; } }

		public NyoPredictionScore Score { get { return score; } }

		// The candle that closed on this bar, with Action decided (null on other bars)
		public NyoSession Decision { get; private set; }

		public void OnBar(DateTime barStart, DateTime barEnd, double o, double h, double l, double c, double v)
		{
			Decision = null;
			engine.OnBar(barStart, barEnd, o, h, l, c, v);

			NyoSession done = engine.JustSettled;
			if (done != null)
			{
				score.Record(done);
				if (policy.Learner != null)
					policy.Learner.Learn(done);
			}

			NyoSession x = engine.CandleClosed;
			if (x != null)
			{
				x.Action = policy.Decide(x);
				Decision = x;
			}
		}
	}

	// ─────────────────────────── Hourly close zones ───────────────────────────
	// Port of section 2 of the Pine script.
	public sealed class NyoZone
	{
		public DateTime Key;			// anchor: the 1H close (+ shift), NY time
		public DateTime FirstBarEnd;	// close time of the first bar in the zone (for drawing)
		public DateTime LastBarEnd;		// close time of the last bar the zone reaches
		public double Top;
		public double Bottom;
		public double LinePrice = double.NaN;
		public DateTime EndT;
		public DateTime StopT;
		public bool Done;
		public bool Live = true;
		public int Side;
		public bool Inside = true;
		public int Touches;
		public int Id;
		public bool Changed;			// needs redrawing (created, grown, finished, touched, crossed)
	}

	public sealed class NyoZoneTracker
	{
		public int PreMinutes = 5;
		public int PostMinutes = 5;
		public bool AllHours = false;
		public int FromHour = 10;
		public int ToHour = 16;
		public bool UseBodies = false;
		public NyoZoneExtend Extend = NyoZoneExtend.UntilCrossed;
		public int ExtendHours = 4;
		public int MaxZones = 15;
		public int ShiftMinutes = 0;

		private readonly List<NyoZone> zones = new List<NyoZone>();
		private readonly List<NyoZone> removed = new List<NyoZone>();
		private int nextId;

		public List<NyoZone> Zones { get { return zones; } }

		// Zones dropped on the last bar because of MaxZones (delete their drawings)
		public List<NyoZone> Removed { get { return removed; } }

		public bool HourOk(DateTime anchor)
		{
			int h = anchor.AddMinutes(-ShiftMinutes).Hour;
			bool inRange = FromHour <= ToHour ? (h >= FromHour && h <= ToHour) : (h >= FromHour || h <= ToHour);
			return AllHours || inRange;
		}

		public string Label(NyoZone z)
		{
			string t = z.Key.AddMinutes(-ShiftMinutes).ToString("HH:mm", CultureInfo.InvariantCulture);
			return z.Touches > 0 ? t + " · " + z.Touches + (z.Touches == 1 ? " toque" : " toques") : t;
		}

		public void OnBar(DateTime barStart, DateTime barEnd, double o, double h, double l, double c)
		{
			removed.Clear();
			foreach (NyoZone z in zones)
				z.Changed = false;

			DateTime hourStart = new DateTime(barStart.Year, barStart.Month, barStart.Day, barStart.Hour, 0, 0);
			DateTime aCur = hourStart.AddMinutes(ShiftMinutes);
			DateTime aNext = aCur.AddHours(1);
			bool inNext = barStart < aNext.AddMinutes(PostMinutes) && barEnd > aNext.AddMinutes(-PreMinutes);
			bool inCur = barStart < aCur.AddMinutes(PostMinutes) && barEnd > aCur.AddMinutes(-PreMinutes);
			double zHi = UseBodies ? Math.Max(o, c) : h;
			double zLo = UseBodies ? Math.Min(o, c) : l;

			// Create the zone (minutes before the close) or grow it (before and after)
			if (inNext || inCur)
			{
				DateTime key = inNext ? aNext : aCur;
				if (HourOk(key))
				{
					NyoZone lz = zones.Count > 0 ? zones[zones.Count - 1] : null;
					bool same = lz != null && lz.Key == key;
					if (!same && barStart < key)
					{
						NyoZone z = new NyoZone();
						z.Id = nextId++;
						z.Key = key;
						z.FirstBarEnd = barEnd;
						z.LastBarEnd = barEnd;
						z.Top = zHi;
						z.Bottom = zLo;
						z.LinePrice = c;
						z.EndT = key.AddMinutes(PostMinutes);
						z.StopT = z.EndT.AddHours(ExtendHours);
						z.Changed = true;
						zones.Add(z);
						while (zones.Count > MaxZones)
						{
							removed.Add(zones[0]);
							zones.RemoveAt(0);
						}
					}
					else if (same && !lz.Done)
					{
						lz.Top = Math.Max(lz.Top, zHi);
						lz.Bottom = Math.Min(lz.Bottom, zLo);
						lz.LastBarEnd = barEnd;
						if (barEnd <= key)
							lz.LinePrice = c;
						lz.Changed = true;
					}
				}
			}

			// Extend, count touches and detect the cross
			foreach (NyoZone z in zones)
			{
				if (!z.Done && barEnd >= z.EndT)
				{
					z.Done = true;
					z.Changed = true;
				}
				else if (z.Done && z.Live)
				{
					bool inZ = h >= z.Bottom && l <= z.Top;
					if (inZ && !z.Inside && z.Side != 0)
					{
						z.Touches++;
						z.Changed = true;
					}
					z.Inside = inZ;
					if (c > z.Top)
					{
						if (z.Side == -1 && Extend == NyoZoneExtend.UntilCrossed)
							z.Live = false;
						z.Side = 1;
					}
					else if (c < z.Bottom)
					{
						if (z.Side == 1 && Extend == NyoZoneExtend.UntilCrossed)
							z.Live = false;
						z.Side = -1;
					}
					if (Extend == NyoZoneExtend.FixedHours && barEnd >= z.StopT)
						z.Live = false;
					z.LastBarEnd = barEnd;
					if (!z.Live)
						z.Changed = true;
				}
			}
		}
	}

	// ─────────────────────────── Helpers ───────────────────────────
	public static class NyoMath
	{
		public static double Mean(List<double> v)
		{
			if (v.Count == 0)
				return double.NaN;
			double t = 0;
			foreach (double x in v)
				t += x;
			return t / v.Count;
		}

		public static double Median(List<double> v)
		{
			if (v.Count == 0)
				return double.NaN;
			List<double> c = new List<double>(v);
			c.Sort();
			int m = c.Count / 2;
			return c.Count % 2 == 1 ? c[m] : (c[m - 1] + c[m]) / 2.0;
		}

		// Population standard deviation (same as Pine's array.stdev default)
		public static double PopStdev(List<double> v)
		{
			if (v.Count == 0)
				return double.NaN;
			double m = Mean(v);
			double t = 0;
			foreach (double x in v)
				t += (x - m) * (x - m);
			return Math.Sqrt(t / v.Count);
		}

		public static void ColumnStats(List<double[]> rows, out double[] mean, out double[] sd)
		{
			int d = NyoFeatures.Count;
			mean = new double[d];
			sd = new double[d];
			if (rows.Count == 0)
				return;
			foreach (double[] r in rows)
				for (int j = 0; j < d; j++)
					mean[j] += r[j];
			for (int j = 0; j < d; j++)
				mean[j] /= rows.Count;
			foreach (double[] r in rows)
				for (int j = 0; j < d; j++)
					sd[j] += (r[j] - mean[j]) * (r[j] - mean[j]);
			for (int j = 0; j < d; j++)
				sd[j] = Math.Sqrt(sd[j] / rows.Count);
		}

		public static double[] Standardize(double[] x, double[] mean, double[] sd)
		{
			double[] z = new double[x.Length];
			for (int j = 0; j < x.Length; j++)
				z[j] = sd[j] > 1e-12 ? (x[j] - mean[j]) / sd[j] : 0.0;
			return z;
		}
	}

	public static class NyoFormat
	{
		// Like Pine's format.volume: 950, 12.3K, 1.25M
		public static string Volume(double v)
		{
			if (double.IsNaN(v))
				return "—";
			double a = Math.Abs(v);
			if (a >= 1e9)
				return (v / 1e9).ToString("0.##", CultureInfo.InvariantCulture) + "B";
			if (a >= 1e6)
				return (v / 1e6).ToString("0.##", CultureInfo.InvariantCulture) + "M";
			if (a >= 1e3)
				return (v / 1e3).ToString("0.##", CultureInfo.InvariantCulture) + "K";
			return v.ToString("0", CultureInfo.InvariantCulture);
		}

		public static string Num(double v, string format)
		{
			return double.IsNaN(v) ? "—" : v.ToString(format, CultureInfo.InvariantCulture);
		}

		public static string Signed(double v, string format)
		{
			return double.IsNaN(v) ? "—" : (v >= 0 ? "+" : "") + v.ToString(format, CultureInfo.InvariantCulture);
		}

		public static string Pct(int k, int n)
		{
			return n > 0 ? (100.0 * k / n).ToString("0", CultureInfo.InvariantCulture) + "%" : "—";
		}

		// hh:mm of the open + minutes (Pine fHM)
		public static string HM(NyoSettings s, int minutes)
		{
			int tot = s.OpenHour * 60 + s.OpenMinute + minutes;
			int h = (tot / 60) % 24;
			int m = tot % 60;
			return h.ToString("00", CultureInfo.InvariantCulture) + ":" + m.ToString("00", CultureInfo.InvariantCulture);
		}

		public static string OutcomeText(NyoOutcome o)
		{
			switch (o)
			{
				case NyoOutcome.Sigue: return "SIGUE";
				case NyoOutcome.Ambigua: return "AMBIGUA";
				case NyoOutcome.Contraria: return "CONTRARIA";
				default: return "";
			}
		}
	}

	// ─────────────────────────── Reports ───────────────────────────
	public static class NyoReport
	{
		public static string BucketName(NyoSettings s, int i)
		{
			string baseName = s.UseMedian ? "mediana" : "media";
			if (i == 0)
				return "Muy alto (>=+" + s.StrongPct.ToString("0", CultureInfo.InvariantCulture) + "%)";
			if (i == 1)
				return "Sobre la " + baseName;
			if (i == 2)
				return "Bajo la " + baseName;
			return "Todas";
		}

		// The Pine historical table as fixed-width text, plus what a shadow trade would have paid.
		public static string HistoryTable(NyoEngine e, bool withTrades)
		{
			NyoSettings s = e.Settings;
			string a = NyoFormat.HM(s, s.FirstCheckpoint);
			string b = NyoFormat.HM(s, s.LastCheckpoint);
			StringBuilder sb = new StringBuilder();
			sb.Append(Pad("Volumen apertura", 20)).Append(PadL("N", 5)).Append(PadL("Sigue " + a, 12)).Append(PadL("Sigue " + b, 12))
				.Append(PadL("Amb. " + b, 11)).Append(PadL("Contra " + b, 13)).Append(PadL("Recorrido", 11));
			if (withTrades)
				sb.Append(PadL("Follow win", 12)).Append(PadL("avg R", 8)).Append(PadL("Fade win", 10)).Append(PadL("avg R", 8));
			sb.AppendLine();
			for (int i = 0; i < 4; i++)
			{
				NyoBucketStats k = i < 3 ? e.Buckets[i] : e.Total();
				sb.Append(Pad(BucketName(s, i), 20)).Append(PadL(k.N.ToString(CultureInfo.InvariantCulture), 5))
					.Append(PadL(NyoFormat.Pct(k.Sig1, k.N), 12)).Append(PadL(NyoFormat.Pct(k.Sig2, k.N), 12))
					.Append(PadL(NyoFormat.Pct(k.Amb2, k.N), 11)).Append(PadL(NyoFormat.Pct(k.Con2, k.N), 13))
					.Append(PadL(NyoFormat.Signed(k.MedianMove, "0.00") + (k.Moves.Count > 0 ? "x" : ""), 11));
				if (withTrades)
					sb.Append(PadL(NyoFormat.Pct(k.FollowWins, k.FollowTrades), 12)).Append(PadL(NyoFormat.Signed(k.FollowAvgR, "0.00"), 8))
						.Append(PadL(NyoFormat.Pct(k.FadeWins, k.FadeTrades), 10)).Append(PadL(NyoFormat.Signed(k.FadeAvgR, "0.00"), 8));
				sb.AppendLine();
			}
			return sb.ToString();
		}

		// Did the sessions the policy picked beat simply trading every session?
		public static string PolicySummary(NyoPolicy policy, NyoPredictionScore sc)
		{
			StringBuilder sb = new StringBuilder();
			string who = policy.Learner != null && policy.Mode != NyoMode.Rules
				? "Learner " + policy.Learner.Name + " · trained on " + policy.Learner.TrainingCount + " sessions"
				: "Rules (the Pine hypothesis)";
			sb.AppendLine(who + " · sessions decided before knowing the outcome: " + sc.Sessions);
			if (sc.Sessions == 0)
			{
				sb.AppendLine("  (nothing decided yet: load more history or lower MinTrainingSessions)");
				return sb.ToString();
			}
			sb.AppendLine("  " + Pad("", 26) + PadL("trades", 7) + PadL("win", 6) + PadL("avg R", 8) + PadL("total R", 10));
			sb.AppendLine(Line("Follow EVERY session", sc.Sessions, sc.FollowWins, sc.FollowR));
			sb.AppendLine(Line("Fade EVERY session", sc.Sessions, sc.FadeWins, sc.FadeR));
			sb.AppendLine(Line("Follow signals taken", sc.FollowSignals, sc.FollowSignalWins, sc.FollowSignalR));
			sb.AppendLine(Line("Fade signals taken", sc.FadeSignals, sc.FadeSignalWins, sc.FadeSignalR));
			if (sc.Predictions > 0)
				sb.AppendLine("  Brier score of the follow win chance " + NyoFormat.Num(sc.Brier, "0.0000") + " vs " + NyoFormat.Num(sc.BrierBaseline, "0.0000")
					+ " for always guessing the average (lower is better)");
			sb.AppendLine("  It only adds value if the signals' avg R beats the EVERY-session rows (shadow trades, before costs).");
			return sb.ToString();
		}

		private static string Line(string name, int n, int wins, double sumR)
		{
			return "  " + Pad(name, 26) + PadL(n.ToString(CultureInfo.InvariantCulture), 7) + PadL(NyoFormat.Pct(wins, n), 6)
				+ PadL(NyoFormat.Signed(NyoPredictionScore.Avg(sumR, n), "0.00"), 8) + PadL(n > 0 ? NyoFormat.Signed(sumR, "0.0") : "—", 10);
		}

		public static string CsvHeader()
		{
			StringBuilder sb = new StringBuilder("date,dir,open,high,low,close,volume,base,rvol,zscore,percentile,bucket");
			foreach (string n in NyoFeatures.Names)
				sb.Append(",f_").Append(n);
			sb.Append(",p_follow,er_follow,p_fade,er_fade,action,sig1,outcome,move_r,follow_r,follow_exit,fade_r,fade_exit");
			return sb.ToString();
		}

		public static string CsvRow(NyoSession x)
		{
			CultureInfo ci = CultureInfo.InvariantCulture;
			StringBuilder sb = new StringBuilder();
			sb.Append(x.Date.ToString("yyyy-MM-dd", ci)).Append(',').Append(x.Dir)
				.Append(',').Append(N(x.Open)).Append(',').Append(N(x.High)).Append(',').Append(N(x.Low)).Append(',').Append(N(x.Close))
				.Append(',').Append(N(x.Volume)).Append(',').Append(N(x.Base)).Append(',').Append(N(x.Rvol))
				.Append(',').Append(N(x.ZScore)).Append(',').Append(N(x.Percentile)).Append(',').Append(x.Bucket);
			foreach (double f in x.Features)
				sb.Append(',').Append(N(f));
			sb.Append(',').Append(N(x.PFollow)).Append(',').Append(N(x.RFollow)).Append(',').Append(N(x.PFade)).Append(',').Append(N(x.RFade))
				.Append(',').Append(x.Decided ? x.Action.ToString(ci) : "")
				.Append(',').Append(x.Settled ? (x.Sig1 ? "1" : "0") : "")
				.Append(',').Append(NyoFormat.OutcomeText(x.Outcome)).Append(',').Append(N(x.MoveR))
				.Append(',').Append(x.Follow != null ? N(x.Follow.R) : "").Append(',').Append(x.Follow != null ? x.Follow.ExitReason : "")
				.Append(',').Append(x.Fade != null ? N(x.Fade.R) : "").Append(',').Append(x.Fade != null ? x.Fade.ExitReason : "");
			return sb.ToString();
		}

		private static string N(double v)
		{
			return double.IsNaN(v) ? "" : v.ToString("0.######", CultureInfo.InvariantCulture);
		}

		private static string Pad(string t, int w)
		{
			return t.Length >= w ? t.Substring(0, w) : t.PadRight(w);
		}

		private static string PadL(string t, int w)
		{
			return t.Length >= w ? t : t.PadLeft(w);
		}
	}

	// ─────────────────────────── Time zones ───────────────────────────
	public static class NyoTime
	{
		// "Eastern Standard Time" on Windows (NinjaTrader); IANA name as a fallback (tests on Linux/macOS).
		public static TimeZoneInfo Find(string id)
		{
			string[] ids = { id, "Eastern Standard Time", "America/New_York" };
			foreach (string t in ids)
			{
				if (string.IsNullOrEmpty(t))
					continue;
				try
				{
					return TimeZoneInfo.FindSystemTimeZoneById(t);
				}
				catch (TimeZoneNotFoundException)
				{
				}
				catch (InvalidTimeZoneException)
				{
				}
			}
			return TimeZoneInfo.Local;
		}

		public static DateTime Convert(DateTime t, TimeZoneInfo from, TimeZoneInfo to)
		{
			if (from == null || to == null || from.Id == to.Id)
				return t;
			try
			{
				return TimeZoneInfo.ConvertTime(DateTime.SpecifyKind(t, DateTimeKind.Unspecified), from, to);
			}
			catch (ArgumentException)
			{
				return t;
			}
		}
	}
}
