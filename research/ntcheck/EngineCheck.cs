// Feeds the NQ 1-min CSV through the C# SignalEngine / RiskEngine and writes one row per bar.
using System; using System.IO; using System.Globalization; using RutaCryptoProp;
public static class EngineCheck {
    public static void Main(string[] args) {
        var ci = CultureInfo.InvariantCulture;
        var strict = new SignalEngine(12, 14, 5, 14, 10, 14) { RsiLower = 20, RsiUpper = 71, Memory = 0 };
        var active = new SignalEngine(12, 14, 5, 14, 10, 14) { RsiLower = 30, RsiUpper = 70, Memory = 2 };
        using (var w = new StreamWriter(args[1])) {
            w.WriteLine("rsi,atr,vosc,sma,haO,sL,sS,aL,aS,qty,sl,tp");
            bool first = true;
            foreach (var line in File.ReadLines(args[0])) {
                if (first) { first = false; continue; }
                var f = line.Split(',');
                double o = double.Parse(f[1], ci), h = double.Parse(f[2], ci), l = double.Parse(f[3], ci), c = double.Parse(f[4], ci), v = double.Parse(f[5], ci);
                strict.Update(o, h, l, c, v, c, false, double.NaN);
                active.Update(o, h, l, c, v, c, false, double.NaN);
                var p = RiskEngine.Plan(SizingMode.AtrStopAutoContracts, 2000, strict.Atr, 0.25, 0.5, 1.24, 1, 2000, 1500, 10, 50, 2.0, 4.0, 8);
                w.WriteLine(string.Join(",", new string[] {
                    strict.Rsi.ToString("R", ci), strict.Atr.ToString("R", ci), strict.VolOsc.ToString("R", ci), strict.Trend.ToString("R", ci), strict.HaOpen.ToString("R", ci),
                    strict.LongSignal ? "1" : "0", strict.ShortSignal ? "1" : "0", active.LongSignal ? "1" : "0", active.ShortSignal ? "1" : "0",
                    p.Qty.ToString(), p.StopTicks.ToString(), p.TargetTicks.ToString() }));
            }
        }
    }
}
