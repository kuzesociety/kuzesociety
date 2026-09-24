using System;
using System.Collections.Generic;
using System.Globalization;
using NinjaTrader.NinjaScript.AddOns.NYOpen;

// Unit tests for NYOpenCore.cs. Plain console app so it runs with just the .NET SDK:
//     dotnet run --project ninjatrader/tests/NYOpenCore.Tests
internal static class Program
{
	private static int failures;
	private static int checks;

	private static int Main()
	{
		Run("NeedHistory matches Pine", TestNeedHistory);
		Run("RVOL, buckets and outcomes on a hand-made week", TestHandMade);
		Run("Median base", TestMedian);
		Run("Shadow trade stop / target / gap / time exit", TestShadowTrade);
		Run("Engine shadow trades use the candle extremes", TestEngineShadow);
		Run("1-minute and 5-minute bars give the same sessions", TestAggregation);
		Run("Half-day session settles at the next open", TestHalfDay);
		Run("Rules policy", TestRulesPolicy);
		Run("No look-ahead: changing the future does not change past predictions", TestNoLookahead);
		Run("Learners only train on sessions that already finished", TestTrainingCount);
		Run("Learners find a planted pattern", TestLearnersFindPattern);
		Run("Learners on pure noise (informational)", TestNoise);
		Run("Hourly zones on 1-minute bars", TestZones1m);
		Run("Hourly zones on 5-minute bars and MaxZones", TestZones5m);
		Run("Time zone conversion", TestTimeZone);
		Run("CSV row has as many columns as the header", TestCsv);

		Console.WriteLine();
		Console.WriteLine(failures == 0 ? "ALL PASSED (" + checks + " checks)" : failures + " FAILED of " + checks + " checks");
		return failures == 0 ? 0 : 1;
	}

	// ─────────────────────────── tiny test framework ───────────────────────────
	private static void Run(string name, Action test)
	{
		Console.WriteLine("── " + name);
		try
		{
			test();
		}
		catch (Exception ex)
		{
			failures++;
			Console.WriteLine("   EXCEPTION " + ex);
		}
	}

	private static void Check(bool ok, string what)
	{
		checks++;
		if (!ok)
		{
			failures++;
			Console.WriteLine("   FAIL " + what);
		}
	}

	private static void Near(double actual, double expected, string what, double tol = 1e-9)
	{
		bool ok = (double.IsNaN(actual) && double.IsNaN(expected)) || Math.Abs(actual - expected) <= tol;
		Check(ok, what + ": expected " + expected.ToString(CultureInfo.InvariantCulture) + ", got " + actual.ToString(CultureInfo.InvariantCulture));
	}

	// ─────────────────────────── bars ───────────────────────────
	private sealed class Bar
	{
		public DateTime Start;
		public DateTime End;
		public double O;
		public double H;
		public double L;
		public double C;
		public double V;
	}

	private static Bar B(DateTime start, int minutes, double o, double h, double l, double c, double v)
	{
		Bar b = new Bar();
		b.Start = start;
		b.End = start.AddMinutes(minutes);
		b.O = o;
		b.H = h;
		b.L = l;
		b.C = c;
		b.V = v;
		return b;
	}

	private static void Feed(NyoEngine e, IEnumerable<Bar> bars)
	{
		foreach (Bar b in bars)
			e.OnBar(b.Start, b.End, b.O, b.H, b.L, b.C, b.V);
	}

	private static void Feed(NyoRunner r, IEnumerable<Bar> bars)
	{
		foreach (Bar b in bars)
			r.OnBar(b.Start, b.End, b.O, b.H, b.L, b.C, b.V);
	}

	// One RTH day of 5-minute bars: the 09:30 candle, then flat at 'after' until 16:00.
	private static List<Bar> Day5(DateTime date, double o, double h, double l, double c, double vol, double after)
	{
		List<Bar> bars = new List<Bar>();
		DateTime t = date.Date.AddHours(9).AddMinutes(30);
		bars.Add(B(t, 5, o, h, l, c, vol));
		for (t = t.AddMinutes(5); t < date.Date.AddHours(16); t = t.AddMinutes(5))
			bars.Add(B(t, 5, after, after, after, after, 10));
		return bars;
	}

	private static DateTime D(int y, int m, int d)
	{
		return new DateTime(y, m, d);
	}

	// Weekdays starting at 'first'
	private static List<DateTime> Weekdays(DateTime first, int count)
	{
		List<DateTime> days = new List<DateTime>();
		for (DateTime d = first; days.Count < count; d = d.AddDays(1))
			if (d.DayOfWeek != DayOfWeek.Saturday && d.DayOfWeek != DayOfWeek.Sunday)
				days.Add(d);
		return days;
	}

	// Synthetic 1-minute data, 08:00–17:00 NY. 'edge' plants a pattern:
	// high opening volume → price drifts with the candle, low volume → against it.
	private static List<Bar> Synthetic(int seed, int days, double edge, int changeSeedAfterDay = -1, int seed2 = 0)
	{
		Random rnd = new Random(seed);
		List<Bar> bars = new List<Bar>();
		double px = 15000;
		int di = 0;
		foreach (DateTime day in Weekdays(D(2021, 1, 4), days))
		{
			if (di == changeSeedAfterDay)
				rnd = new Random(seed2);
			di++;
			double m = Math.Exp(Gauss(rnd) * 0.45);
			int candleDir = rnd.NextDouble() < 0.5 ? 1 : -1;
			double drift = m > 1.25 ? 0.12 * candleDir : m < 0.85 ? -0.08 * candleDir : 0.0;
			drift *= edge;
			for (DateTime t = day.AddHours(8); t < day.AddHours(17); t = t.AddMinutes(1))
			{
				int mins = (int)(t - day.AddHours(9).AddMinutes(30)).TotalMinutes;
				double mu = 0, sd = 2.0, vol = 40;
				if (mins >= 0 && mins < 5)
				{
					mu = 2.5 * candleDir;
					sd = 4;
					vol = 3000 * m * (0.8 + 0.4 * rnd.NextDouble());
				}
				else if (mins >= 5 && mins < 390)
				{
					mu = drift;
					sd = 1.5;
					vol = 400;
				}
				double o = px;
				double c = o + mu + sd * Gauss(rnd);
				double h = Math.Max(o, c) + Math.Abs(Gauss(rnd));
				double l = Math.Min(o, c) - Math.Abs(Gauss(rnd));
				bars.Add(B(t, 1, R4(o), R4(h), R4(l), R4(c), Math.Round(vol)));
				px = c;
			}
			px += 20 * Gauss(rnd); // overnight gap
		}
		return bars;
	}

	private static double R4(double v)
	{
		return Math.Round(v * 4) / 4.0;
	}

	private static List<Bar> To5m(List<Bar> m1)
	{
		List<Bar> res = new List<Bar>();
		Bar cur = null;
		foreach (Bar b in m1)
		{
			DateTime s = new DateTime(b.Start.Year, b.Start.Month, b.Start.Day, b.Start.Hour, b.Start.Minute - b.Start.Minute % 5, 0);
			if (cur == null || cur.Start != s)
			{
				cur = B(s, 5, b.O, b.H, b.L, b.C, 0);
				res.Add(cur);
			}
			cur.H = Math.Max(cur.H, b.H);
			cur.L = Math.Min(cur.L, b.L);
			cur.C = b.C;
			cur.V += b.V;
		}
		return res;
	}

	private static double Gauss(Random r)
	{
		double u1 = 1.0 - r.NextDouble();
		double u2 = r.NextDouble();
		return Math.Sqrt(-2.0 * Math.Log(u1)) * Math.Sin(2.0 * Math.PI * u2);
	}

	// ─────────────────────────── tests ───────────────────────────
	private static void TestNeedHistory()
	{
		NyoSettings s = new NyoSettings();
		s.Lookback = 20;
		Check(s.NeedHistory == 10, "lookback 20 → 10");
		s.Lookback = 21;
		Check(s.NeedHistory == 11, "lookback 21 → 11 (10.5 rounds up like Pine)");
		s.Lookback = 3;
		Check(s.NeedHistory == 3, "lookback 3 → 3");
		Near(s.StrongRvol, 1.5, "strong RVOL");
	}

	private static List<Bar> HandMadeWeek()
	{
		List<Bar> bars = new List<Bar>();
		List<DateTime> days = Weekdays(D(2024, 3, 4), 13);
		for (int i = 0; i < 10; i++)
			bars.AddRange(Day5(days[i], 100, 102, 99, 101.5, 1000, 101.5));
		bars.AddRange(Day5(days[10], 100, 102, 99, 101.5, 2000, 104));	// very high volume, follows
		bars.AddRange(Day5(days[11], 100, 102, 99, 101.5, 1100, 100.5));	// above the mean, back inside the candle
		bars.AddRange(Day5(days[12], 100, 102, 99, 101.5, 500, 98));		// below the mean, below the candle low
		return bars;
	}

	private static void TestHandMade()
	{
		NyoEngine e = new NyoEngine(new NyoSettings());
		Feed(e, HandMadeWeek());
		List<NyoSession> ss = e.Sessions;
		Check(ss.Count == 13, "13 sessions");
		Check(ss[0].Bucket == -1 && ss[0].Reading == "calentando 0/10", "day 1 warming up: " + ss[0].Reading);
		Check(ss[9].Bucket == -1 && ss[9].Reading == "calentando 9/10", "day 10 warming up: " + ss[9].Reading);

		NyoSession d11 = ss[10];
		Near(d11.Base, 1000, "day 11 base");
		Near(d11.Rvol, 2.0, "day 11 RVOL");
		Check(d11.Bucket == 0, "day 11 very high");
		Check(d11.Reading == "SIGUE ▲ · fuerte", "day 11 reading: " + d11.Reading);
		Check(double.IsNaN(d11.ZScore), "day 11 z-score undefined (all history equal)");
		Near(d11.Percentile, 100, "day 11 percentile");
		Check(d11.Outcome == NyoOutcome.Sigue && d11.Sig1, "day 11 followed");
		Near(d11.MoveR, (104 - 101.5) / 3.0, "day 11 move in candle ranges");

		NyoSession d12 = ss[11];
		Near(d12.Base, 12000.0 / 11.0, "day 12 base includes day 11");
		Near(d12.Rvol, 1100 / (12000.0 / 11.0), "day 12 RVOL");
		Check(d12.Bucket == 1, "day 12 above the mean");
		Check(d12.Outcome == NyoOutcome.Ambigua, "day 12 ambiguous");

		NyoSession d13 = ss[12];
		Check(d13.Bucket == 2, "day 13 below the mean");
		Check(d13.Reading == "AMBIGUA / CONTRARIA", "day 13 reading");
		Check(d13.Outcome == NyoOutcome.Contraria, "day 13 contrary");

		Check(e.Buckets[0].N == 1 && e.Buckets[0].Sig2 == 1, "bucket 0 stats");
		Check(e.Buckets[1].N == 1 && e.Buckets[1].Amb2 == 1, "bucket 1 stats");
		Check(e.Buckets[2].N == 1 && e.Buckets[2].Con2 == 1, "bucket 2 stats");
		Check(e.Total().N == 3, "total N");
		Check(d11.End2 == d11.WindowStart.AddMinutes(390) && d11.End1 == d11.WindowStart.AddMinutes(60), "checkpoints");
		Check(d11.T2 == d11.Date.AddHours(16), "C2 taken from the bar that closes at 16:00");

		string table = NyoReport.HistoryTable(e, true);
		Check(table.Contains("Muy alto") && table.Contains("Todas"), "history table renders");
	}

	private static void TestMedian()
	{
		NyoSettings s = new NyoSettings();
		s.UseMedian = true;
		s.Lookback = 5;	// need 3
		NyoEngine e = new NyoEngine(s);
		List<DateTime> days = Weekdays(D(2024, 1, 8), 4);
		double[] vols = { 100, 300, 1000, 450 };
		for (int i = 0; i < 4; i++)
			Feed(e, Day5(days[i], 100, 102, 99, 101.5, vols[i], 103));
		NyoSession x = e.Sessions[3];
		Near(x.Base, 300, "median of 100, 300, 1000");
		Near(x.Rvol, 1.5, "RVOL vs median");
		Near(x.ZScore, (450 - NyoMath.Mean(new List<double> { 100, 300, 1000 })) / NyoMath.PopStdev(new List<double> { 100, 300, 1000 }), "z-score uses the mean");
		Near(x.Percentile, 100.0 * 2 / 3, "percentile");
	}

	private static void TestShadowTrade()
	{
		NyoShadowTrade t = Shadow(1, 100, 2, 4);
		t.Update(100, 101, 97.5);
		Check(t.Exited && t.ExitReason == "stop", "long stopped");
		Near(t.R, -1, "stop = -1R");

		t = Shadow(1, 100, 2, 4);
		t.Update(100, 104.5, 99);
		Check(t.ExitReason == "target", "long target");
		Near(t.R, 2, "target = 2R");

		t = Shadow(1, 100, 2, 4);
		t.Update(100, 105, 97);
		Check(t.ExitReason == "stop", "stop and target in one bar → assume the stop");

		t = Shadow(1, 100, 2, 4);
		t.Update(97, 97.5, 96);
		Near(t.R, -1.5, "gap through the stop fills at the open");

		t = Shadow(1, 100, 2, 0);
		t.Update(100, 150, 99);
		Check(!t.Exited, "no target → still open");
		t.Close(101, "time");
		Near(t.R, 0.5, "time exit");
		t.Close(90, "time");
		Near(t.R, 0.5, "closing twice does nothing");

		t = Shadow(-1, 100, 2, 0);
		t.Update(100, 102.5, 99);
		Check(t.ExitReason == "stop", "short stopped above");
		Near(t.R, -1, "short stop = -1R");
	}

	private static NyoShadowTrade Shadow(int dir, double entry, double stop, double target)
	{
		NyoShadowTrade t = new NyoShadowTrade();
		t.Dir = dir;
		t.Entry = entry;
		t.StopDistance = stop;
		t.TargetDistance = target;
		return t;
	}

	private static void TestEngineShadow()
	{
		NyoEngine e = new NyoEngine(new NyoSettings());
		Feed(e, HandMadeWeek());
		NyoSession d11 = e.Sessions[10];	// bull candle 100/102/99/101.5, then 104 all day
		Near(d11.Follow.StopDistance, 2.5, "long stop below the candle low");
		Near(d11.Follow.R, (104 - 101.5) / 2.5, "long held to 16:00");
		Check(d11.Follow.ExitReason == "time", "time exit");
		Near(d11.Fade.StopDistance, 0.5, "fade stop above the candle high");
		Check(d11.Fade.ExitReason == "stop", "fade stopped");
		Near(d11.Fade.R, -(104 - 101.5) / 0.5, "fade gapped through its stop at the next open");

		NyoSession d13 = e.Sessions[12];	// then 98
		Check(d13.Follow.ExitReason == "stop" && !d13.Follow.Win, "day 13 long stopped");
		Check(d13.Fade.Win, "day 13 fade won");

		NyoSettings s = new NyoSettings();
		s.StopAtCandleExtreme = false;
		s.StopRangeMultiple = 0.5;
		s.TargetR = 1;
		NyoEngine e2 = new NyoEngine(s);
		Feed(e2, HandMadeWeek());
		Near(e2.Sessions[10].Follow.StopDistance, 1.5, "range-multiple stop");
		Check(e2.Sessions[10].Follow.ExitReason == "target", "1R target hit");
		Near(e2.Sessions[10].Follow.R, (104 - 101.5) / 1.5, "target gapped: filled at the open");
	}

	private static void TestAggregation()
	{
		List<Bar> m1 = Synthetic(7, 80, 1.0);
		NyoEngine a = new NyoEngine(new NyoSettings());
		NyoEngine b = new NyoEngine(new NyoSettings());
		Feed(a, m1);
		Feed(b, To5m(m1));
		Check(a.Sessions.Count == 80 && b.Sessions.Count == 80, "80 sessions each: " + a.Sessions.Count + " / " + b.Sessions.Count);
		int n = Math.Min(a.Sessions.Count, b.Sessions.Count);
		int bad = 0;
		for (int i = 0; i < n; i++)
		{
			NyoSession x = a.Sessions[i], y = b.Sessions[i];
			bool same = x.Date == y.Date && Math.Abs(x.Open - y.Open) < 1e-9 && Math.Abs(x.High - y.High) < 1e-9
				&& Math.Abs(x.Low - y.Low) < 1e-9 && Math.Abs(x.Close - y.Close) < 1e-9 && Math.Abs(x.Volume - y.Volume) < 1e-6
				&& x.Bucket == y.Bucket && x.Outcome == y.Outcome && x.Sig1 == y.Sig1
				&& ((double.IsNaN(x.Rvol) && double.IsNaN(y.Rvol)) || Math.Abs(x.Rvol - y.Rvol) < 1e-9)
				&& ((double.IsNaN(x.MoveR) && double.IsNaN(y.MoveR)) || Math.Abs(x.MoveR - y.MoveR) < 1e-9);
			if (!same)
				bad++;
		}
		Check(bad == 0, bad + " sessions differ between 1m and 5m");
		Check(a.Total().N == b.Total().N && a.Total().N > 50, "same number of measured sessions: " + a.Total().N);
		Check(a.Sessions[40].FeaturesValid, "features valid once warmed up");
	}

	private static void TestHalfDay()
	{
		NyoEngine e = new NyoEngine(new NyoSettings());
		List<DateTime> days = Weekdays(D(2024, 11, 18), 13);
		List<Bar> bars = new List<Bar>();
		for (int i = 0; i < 12; i++)
			bars.AddRange(Day5(days[i], 100, 102, 99, 101.5, 1000, 103));
		// day 12 closes at 13:00
		bars.RemoveAll(x => x.Start.Date == days[11] && x.End > days[11].AddHours(13));
		bars.AddRange(Day5(days[12], 100, 102, 99, 101.5, 1000, 103));
		NyoSession half = null;
		foreach (Bar b in bars)
		{
			e.OnBar(b.Start, b.End, b.O, b.H, b.L, b.C, b.V);
			if (e.JustSettled != null && e.JustSettled.Date == days[11])
			{
				half = e.JustSettled;
				Check(b.Start == days[12].AddHours(9).AddMinutes(30), "half day settled at the next 09:30");
			}
		}
		Check(half != null && half.Settled, "half day settled");
		Check(half != null && half.T2 == days[11].AddHours(13), "last close of the half day used");
	}

	private static void TestRulesPolicy()
	{
		NyoPolicy p = new NyoPolicy();
		NyoSession x = new NyoSession();
		x.Bucket = 0;
		Check(p.Decide(x) == 1, "very high → follow");
		x.Bucket = 1;
		Check(p.Decide(x) == 1, "above → follow");
		p.RulesStrongOnly = true;
		Check(p.Decide(x) == 0, "above, strong only → no trade");
		x.Bucket = 2;
		Check(p.Decide(x) == 0, "below → no trade");
		p.FadeLowVolume = true;
		Check(p.Decide(x) == -1, "below + fade → fade");
		x.Bucket = -1;
		Check(p.Decide(x) == 0, "not measurable → no trade");
	}

	private static NyoRunner MakeRunner(NyoMode mode, int minTraining)
	{
		return MakeRunner(mode, minTraining, true);
	}

	private static NyoRunner MakeRunner(NyoMode mode, int minTraining, bool stopAtCandleExtreme)
	{
		NyoSettings s = new NyoSettings();
		s.MinStopDistance = 3.0;
		s.StopAtCandleExtreme = stopAtCandleExtreme;
		NyoPolicy p = new NyoPolicy();
		p.Mode = mode;
		p.MinTrainingSessions = minTraining;
		p.AllowFade = true;
		p.FadeLowVolume = true;
		p.Learner = NyoPolicy.CreateLearner(mode, 20, 25, 5000, 5, 0.05, 0.01, 5.0);
		return new NyoRunner(new NyoEngine(s), p);
	}

	private static bool SamePrediction(NyoSession x, NyoSession y)
	{
		return x.Action == y.Action && x.Decided == y.Decided && Same(x.PFollow, y.PFollow) && Same(x.RFollow, y.RFollow)
			&& Same(x.PFade, y.PFade) && Same(x.RFade, y.RFade);
	}

	private static bool Same(double a, double b)
	{
		return (double.IsNaN(a) && double.IsNaN(b)) || a == b;
	}

	private static void TestNoLookahead()
	{
		List<Bar> a = To5m(Synthetic(11, 300, 1.0));
		List<Bar> b = To5m(Synthetic(11, 300, 1.0, 200, 999));
		DateTime cut = Weekdays(D(2021, 1, 4), 200)[199];	// day 200 is the last identical one
		Check(a[0].Start == b[0].Start && Math.Abs(a[5000].C - b[5000].C) < 1e-9, "same beginning");

		NyoMode[] modes = { NyoMode.Buckets, NyoMode.Knn, NyoMode.Logistic };
		foreach (NyoMode mode in modes)
		{
			NyoRunner ra = MakeRunner(mode, 30), rb = MakeRunner(mode, 30);
			Feed(ra, a);
			Feed(rb, b);
			int compared = 0, diff = 0, predicted = 0;
			for (int i = 0; i < ra.Engine.Sessions.Count; i++)
			{
				NyoSession x = ra.Engine.Sessions[i], y = rb.Engine.Sessions[i];
				if (x.Date > cut)
					break;
				compared++;
				if (!double.IsNaN(x.RFollow))
					predicted++;
				if (!SamePrediction(x, y))
					diff++;
			}
			Check(compared == 200 && predicted > 100, mode + ": compared " + compared + " sessions, " + predicted + " with a prediction");
			Check(diff == 0, mode + ": " + diff + " past predictions changed when only the future changed");
			bool later = false;
			for (int i = 0; i < ra.Engine.Sessions.Count; i++)
				if (ra.Engine.Sessions[i].Date > cut && !SamePrediction(ra.Engine.Sessions[i], rb.Engine.Sessions[i]))
					later = true;
			Check(later, mode + ": sanity, predictions after the change do differ");
		}
	}

	private static void TestTrainingCount()
	{
		NyoRunner r = MakeRunner(NyoMode.Knn, 0);
		int bad = 0, decisions = 0;
		foreach (Bar b in To5m(Synthetic(5, 150, 1.0)))
		{
			r.OnBar(b.Start, b.End, b.O, b.H, b.L, b.C, b.V);
			if (r.Decision == null)
				continue;
			decisions++;
			int learnable = 0;
			List<NyoSession> ss = r.Engine.Sessions;
			for (int i = 0; i < ss.Count - 1; i++)
				if (NyoLearner.CanLearn(ss[i]))
					learnable++;
			Check(!ss[ss.Count - 1].Settled, "today's session is not settled when deciding");
			if (r.Policy.Learner.TrainingCount != learnable)
				bad++;
		}
		Check(decisions == 150, "one decision per day");
		Check(bad == 0, bad + " decisions where the learner had seen something other than the finished sessions");
	}

	private static void TestLearnersFindPattern()
	{
		// Stops at 1x the candle range for both sides, so fades are not all tiny-stop lottery tickets
		List<Bar> bars = To5m(Synthetic(3, 1200, 1.0));
		NyoMode[] modes = { NyoMode.Buckets, NyoMode.Knn, NyoMode.Logistic };
		foreach (NyoMode mode in modes)
		{
			NyoRunner r = MakeRunner(mode, 100, false);
			Feed(r, bars);
			NyoPredictionScore sc = r.Score;
			Console.Write(Indent(NyoReport.PolicySummary(r.Policy, sc)));
			double every = NyoPredictionScore.Avg(sc.FollowR, sc.Sessions);
			double everyFade = NyoPredictionScore.Avg(sc.FadeR, sc.Sessions);
			Check(sc.Sessions > 900, mode + ": decided " + sc.Sessions);
			Check(sc.Brier < sc.BrierBaseline, mode + ": Brier beats guessing the average");
			Check(sc.FollowSignals > 100 && NyoPredictionScore.Avg(sc.FollowSignalR, sc.FollowSignals) > every + 0.3, mode + ": follow signals pay more than following every day");
			Check(sc.FadeSignals > 100 && NyoPredictionScore.Avg(sc.FadeSignalR, sc.FadeSignals) > everyFade + 0.3, mode + ": fade signals pay more than fading every day");
		}
		NyoRunner rr = MakeRunner(NyoMode.Rules, 0, false);
		Feed(rr, bars);
		Console.Write(Indent(NyoReport.HistoryTable(rr.Engine, true)));
		Console.Write(Indent(NyoReport.PolicySummary(rr.Policy, rr.Score)));
		Check(rr.Engine.Buckets[0].Sig2 > rr.Engine.Buckets[0].N / 2, "planted: very high volume follows");
		Check(rr.Engine.Buckets[2].Con2 > rr.Engine.Buckets[2].N / 2, "planted: low volume reverses");
	}

	private static void TestNoise()
	{
		List<Bar> bars = To5m(Synthetic(4, 1200, 0.0));
		NyoMode[] modes = { NyoMode.Knn, NyoMode.Logistic };
		foreach (NyoMode mode in modes)
		{
			NyoRunner r = MakeRunner(mode, 100);
			Feed(r, bars);
			Console.Write(Indent(NyoReport.PolicySummary(r.Policy, r.Score)));
			Check(r.Score.Brier > r.Score.BrierBaseline - 0.01, mode + ": no fake skill on noise");
		}
	}

	private static List<Bar> Minutes(DateTime from, int count, double[] closes)
	{
		List<Bar> bars = new List<Bar>();
		for (int i = 0; i < count; i++)
		{
			double c = closes[i];
			double o = i == 0 ? c : closes[i - 1];
			bars.Add(B(from.AddMinutes(i), 1, o, Math.Max(o, c) + 0.25, Math.Min(o, c) - 0.25, c, 10));
		}
		return bars;
	}

	private static void TestZones1m()
	{
		DateTime day = D(2024, 5, 6);
		DateTime from = day.AddHours(10).AddMinutes(50);
		// 10:50 → 11:30: flat 100 until 11:05, up to 106, back into the zone, then down through it
		double[] closes = new double[40];
		for (int i = 0; i < 40; i++)
		{
			int m = i;	// minutes after 10:50
			closes[i] = m < 15 ? 100 + (m == 9 ? 1 : 0) : m < 20 ? 106 : m < 25 ? 100.5 : m < 30 ? 106 : 90;
		}
		NyoZoneTracker zt = new NyoZoneTracker();
		foreach (Bar b in Minutes(from, 40, closes))
			zt.OnBar(b.Start, b.End, b.O, b.H, b.L, b.C);
		Check(zt.Zones.Count == 1, "one zone");
		NyoZone z = zt.Zones[0];
		Check(z.Key == day.AddHours(11), "anchored at 11:00");
		Check(z.FirstBarEnd == day.AddHours(10).AddMinutes(56), "starts with the 10:55 bar");
		Near(z.LinePrice, 101, "line at the close of the bar ending 11:00");
		Near(z.Top, 101.25, "top");
		Near(z.Bottom, 99.75, "bottom");
		Check(z.Done, "done after 11:05");
		Check(z.Touches == 2, "touches: " + z.Touches);
		Check(!z.Live, "crossed (was above, closed below) → dead");
		Check(z.LastBarEnd == day.AddHours(11).AddMinutes(21), "stops extending when crossed: " + z.LastBarEnd.ToString("HH:mm"));
		Check(zt.Label(z) == "11:00 · 2 toques", "label: " + zt.Label(z));

		NyoZoneTracker late = new NyoZoneTracker();
		late.FromHour = 12;
		foreach (Bar b in Minutes(from, 40, closes))
			late.OnBar(b.Start, b.End, b.O, b.H, b.L, b.C);
		Check(late.Zones.Count == 0, "11:00 outside 12–16 → no zone");

		NyoZoneTracker always = new NyoZoneTracker();
		always.Extend = NyoZoneExtend.Always;
		foreach (Bar b in Minutes(from, 40, closes))
			always.OnBar(b.Start, b.End, b.O, b.H, b.L, b.C);
		Check(always.Zones[0].Live && always.Zones[0].LastBarEnd == day.AddHours(11).AddMinutes(30), "'Always' keeps extending");

		NyoZoneTracker shifted = new NyoZoneTracker();
		shifted.ShiftMinutes = -10;
		foreach (Bar b in Minutes(from.AddMinutes(-10), 40, closes))
			shifted.OnBar(b.Start, b.End, b.O, b.H, b.L, b.C);
		string got = shifted.Zones.Count + " zones";
		foreach (NyoZone sz in shifted.Zones)
			got += " · " + sz.Key.ToString("HH:mm") + " '" + shifted.Label(sz) + "'";
		Check(shifted.Zones.Count == 1 && shifted.Zones[0].Key == day.AddHours(10).AddMinutes(50) && shifted.Label(shifted.Zones[0]).StartsWith("11:00"), "shift -10 → one zone around 10:50, labelled 11:00: " + got);
	}

	private static void TestZones5m()
	{
		DateTime day = D(2024, 5, 7);
		List<Bar> bars = new List<Bar>();
		for (DateTime t = day.AddHours(9).AddMinutes(30); t < day.AddHours(16); t = t.AddMinutes(5))
		{
			double c = 100 + (t.Minute == 55 ? 2 : 0);
			bars.Add(B(t, 5, 100, Math.Max(100, c) + 0.5, 99.5, c, 10));
		}
		NyoZoneTracker zt = new NyoZoneTracker();
		zt.MaxZones = 3;
		zt.Extend = NyoZoneExtend.FixedHours;
		zt.ExtendHours = 1;
		int removed = 0;
		foreach (Bar b in bars)
		{
			zt.OnBar(b.Start, b.End, b.O, b.H, b.L, b.C);
			removed += zt.Removed.Count;
		}
		Check(zt.Zones.Count == 3, "MaxZones keeps 3");
		Check(removed == 4, "10:00…16:00 = 7 zones, 4 dropped: " + removed);
		NyoZone z = zt.Zones[0];
		Check(z.Key == day.AddHours(14), "oldest kept is 14:00");
		Near(z.LinePrice, 102, "line = close of the 13:55–14:00 bar");
		Near(z.Top, 102.5, "top from both bars");
		Check(z.FirstBarEnd == day.AddHours(14) && z.EndT == day.AddHours(14).AddMinutes(5), "two 5m bars");
		Check(!z.Live && z.LastBarEnd == day.AddHours(15).AddMinutes(5), "fixed hours: stops 1h after the zone");
		NyoZone last = zt.Zones[2];
		Check(last.Key == day.AddHours(16) && !last.Done, "16:00 zone has only its pre part (no bars after 16:00)");
	}

	private static void TestTimeZone()
	{
		TimeZoneInfo ny = NyoTime.Find("Eastern Standard Time");
		DateTime summer = NyoTime.Convert(new DateTime(2024, 7, 1, 13, 35, 0), TimeZoneInfo.Utc, ny);
		DateTime winter = NyoTime.Convert(new DateTime(2024, 1, 8, 14, 35, 0), TimeZoneInfo.Utc, ny);
		Check(summer == new DateTime(2024, 7, 1, 9, 35, 0), "UTC → NY in summer: " + summer);
		Check(winter == new DateTime(2024, 1, 8, 9, 35, 0), "UTC → NY in winter: " + winter);
		TimeZoneInfo chicago = NyoTime.Find("Central Standard Time");
		DateTime ct = NyoTime.Convert(new DateTime(2024, 7, 1, 8, 35, 0), chicago, ny);
		Check(ct == new DateTime(2024, 7, 1, 9, 35, 0), "Chicago → NY: " + ct);
	}

	private static void TestCsv()
	{
		NyoRunner r = MakeRunner(NyoMode.Knn, 10);
		Feed(r, To5m(Synthetic(9, 60, 1.0)));
		int cols = NyoReport.CsvHeader().Split(',').Length;
		foreach (NyoSession x in r.Engine.Sessions)
			Check(NyoReport.CsvRow(x).Split(',').Length == cols, "row " + x.Date.ToString("yyyy-MM-dd") + " columns");
		Check(NyoReport.CsvRow(r.Engine.Sessions[59]).Contains("SIGUE") || NyoReport.CsvRow(r.Engine.Sessions[59]).Contains("AMBIGUA") || NyoReport.CsvRow(r.Engine.Sessions[59]).Contains("CONTRARIA"), "outcome written");
	}

	private static string Indent(string s)
	{
		return "   " + s.TrimEnd().Replace("\n", "\n   ") + Environment.NewLine;
	}
}
