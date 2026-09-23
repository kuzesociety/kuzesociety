// Feeds 5-minute NQ candles (New York time) through RutaPullback's direction logic; one row per candle.
using System; using System.IO; using System.Globalization; using RutaPullbackBot;
public static class PullbackCheck {
    public static void Main(string[] args) {
        var ci = CultureInfo.InvariantCulture;
        var trend = new HourlyTrend(50);
        using (var w = new StreamWriter(args[1])) {
            w.WriteLine("open_time,candle,trend,ema,pullback");
            bool first = true;
            foreach (var line in File.ReadLines(args[0])) {
                if (first) { first = false; continue; }
                var f = line.Split(',');
                DateTime t = DateTime.Parse(f[0], ci);
                double o = double.Parse(f[1], ci), c = double.Parse(f[2], ci);
                trend.Update(t, c);
                int candle = Direction.Sign(c - o);
                int tr = double.IsNaN(trend.Value) ? 0 : Direction.Sign(c - trend.Value);
                w.WriteLine(f[0] + "," + candle + "," + tr + "," + trend.Value.ToString("R", ci) + "," + Direction.Decide(DirectionRule.PullbackInTrend, candle, tr, 0));
            }
        }
    }
}
