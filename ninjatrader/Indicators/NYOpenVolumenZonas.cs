#region Using declarations
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Globalization;
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
using NinjaTrader.NinjaScript.DrawingTools;
#endregion

// ═══════════════════════════════════════════════════════════════════════════
//  NY OPEN · VOLUMEN VS SESIONES ANTERIORES  +  ZONAS DE CIERRE HORARIO
//  Port for NinjaTrader 8 of the Pine script in /pinescript/ny_open_volumen_zonas.pine
//
//  1) Vela de apertura NY (09:30–09:35): dirección, volumen vs las N sesiones
//     previas y lectura (SIGUE / SIGUE fuerte / AMBIGUA-CONTRARIA). ¿Caminó o no?
//     medido desde el cierre de la vela en los checkpoints.
//  2) Zonas de cierre horario: 5 min antes → 5 min después de cada cierre de 1H,
//     con línea en el precio del cierre, extendida hasta que el precio la cruce.
//
//  Gráfico de 1m o 5m de un instrumento con volumen real (NQ / MNQ).
//  The logic lives in AddOns/NYOpenCore.cs (shared with the strategy and unit-tested);
//  this file only draws it.
// ═══════════════════════════════════════════════════════════════════════════
namespace NinjaTrader.NinjaScript.Indicators
{
	public enum NyoBase
	{
		Media,
		Mediana
	}

	public enum NyoAltura
	{
		MaxMin,
		Cuerpos
	}

	public enum NyoExtender
	{
		HastaQueLaCruce,
		HorasFijas,
		Siempre
	}

	public class NYOpenVolumenZonas : Indicator
	{
		private NyoEngine engine;
		private NyoZoneTracker zones;
		private TimeZoneInfo nyZone;
		private TimeZoneInfo ntZone;
		private int barMinutes;
		private string tfError;
		private SimpleFont labelFont;
		private SimpleFont smallFont;
		private SimpleFont tableFont;
		private Brush zoneLineDim;
		private Brush resOk;
		private Brush resBad;
		private Brush resAmb;

		protected override void OnStateChange()
		{
			if (State == State.SetDefaults)
			{
				Description = "NY Open: volumen de la vela de apertura vs sesiones anteriores + zonas de cierre horario (port del Pine 'NYO Vol + Zonas 1H').";
				Name = "NYOpenVolumenZonas";
				Calculate = Calculate.OnBarClose;
				IsOverlay = true;
				DisplayInDataBox = false;
				DrawOnPricePanel = true;
				PaintPriceMarkers = false;
				IsSuspendedWhileInactive = true;
				ScaleJustification = ScaleJustification.Right;
				MaximumBarsLookBack = MaximumBarsLookBack.TwoHundredFiftySix;

				ShowOpen = true;
				TimeZoneId = "Eastern Standard Time";
				OpenHour = 9;
				OpenMinute = 30;
				OpenLength = 5;

				Lookback = 20;
				BaseType = NyoBase.Media;
				StrongPct = 50;
				LowRvol = 1.0;

				Checkpoint1 = 60;
				Checkpoint2 = 390;
				MinMove = 0;
				ShowResult = true;
				MinN = 20;

				ShowBox = true;
				ShowLabel = true;
				ColorBar = true;
				ShowToday = true;
				TodayPosition = TextPosition.TopRight;
				ShowHistory = true;
				HistoryPosition = TextPosition.BottomRight;
				UpBrush = Rgb(0x26, 0xa6, 0x9a);
				DownBrush = Rgb(0xef, 0x53, 0x50);
				AmbBrush = Rgb(0x9e, 0x9e, 0x9e);

				ShowZones = true;
				ZonePreMin = 5;
				ZonePostMin = 5;
				ZoneAllHours = false;
				ZoneFromHour = 10;
				ZoneToHour = 16;
				ZoneHeight = NyoAltura.MaxMin;
				ZoneExtend = NyoExtender.HastaQueLaCruce;
				ZoneExtendHours = 4;
				ZoneMax = 15;
				ZoneShift = 0;
				ZoneShowLine = true;
				ZoneShowText = true;
				ZoneBrush = Rgb(0xb3, 0x88, 0xff);
				ZoneOpacity = 20;
				ZoneLineBrush = Rgb(0xb3, 0x88, 0xff);
				ZoneCrossedBrush = Rgb(0x78, 0x7b, 0x86);
				ZoneCrossedOpacity = 10;
			}
			else if (State == State.DataLoaded)
			{
				nyZone = NyoTime.Find(TimeZoneId);
				ntZone = NinjaTrader.Core.Globals.GeneralOptions.TimeZoneInfo;
				barMinutes = BarsPeriod.BarsPeriodType == BarsPeriodType.Minute ? BarsPeriod.Value : 0;

				// Validación de timeframe (same rules as the Pine script)
				tfError = null;
				if (barMinutes <= 0)
					tfError = "Usa un gráfico de minutos (ideal: 5 minutos).";
				else if (ShowOpen && (barMinutes > OpenLength || OpenLength % barMinutes != 0))
					tfError = "La vela de apertura necesita un gráfico de 1m o 5m.";
				else if (ShowZones && barMinutes > 5)
					tfError = "Las zonas de cierre horario necesitan un gráfico de 5m o menor.";

				NyoSettings s = new NyoSettings();
				s.OpenHour = OpenHour;
				s.OpenMinute = OpenMinute;
				s.OpenLengthMinutes = OpenLength;
				s.Lookback = Lookback;
				s.UseMedian = BaseType == NyoBase.Mediana;
				s.StrongPct = StrongPct;
				s.LowRvol = LowRvol;
				s.Checkpoint1 = Checkpoint1;
				s.Checkpoint2 = Checkpoint2;
				s.MinMove = MinMove;
				s.MinStopDistance = TickSize;
				engine = new NyoEngine(s);

				zones = new NyoZoneTracker();
				zones.PreMinutes = ZonePreMin;
				zones.PostMinutes = ZonePostMin;
				zones.AllHours = ZoneAllHours;
				zones.FromHour = ZoneFromHour;
				zones.ToHour = ZoneToHour;
				zones.UseBodies = ZoneHeight == NyoAltura.Cuerpos;
				zones.Extend = ZoneExtend == NyoExtender.Siempre ? NyoZoneExtend.Always : ZoneExtend == NyoExtender.HorasFijas ? NyoZoneExtend.FixedHours : NyoZoneExtend.UntilCrossed;
				zones.ExtendHours = ZoneExtendHours;
				zones.MaxZones = ZoneMax;
				zones.ShiftMinutes = ZoneShift;

				labelFont = new SimpleFont("Arial", 11);
				smallFont = new SimpleFont("Arial", 9);
				tableFont = new SimpleFont("Consolas", 11);
				// Brushes picked in the property grid must be frozen before they are used from the drawing thread
				UpBrush = Frozen(UpBrush);
				DownBrush = Frozen(DownBrush);
				AmbBrush = Frozen(AmbBrush);
				ZoneBrush = Frozen(ZoneBrush);
				ZoneLineBrush = Frozen(ZoneLineBrush);
				ZoneCrossedBrush = Frozen(ZoneCrossedBrush);
				zoneLineDim = Faded(ZoneLineBrush, 0.3);
				resOk = Rgb(0x00, 0xc8, 0x53);
				resBad = Rgb(0xff, 0x52, 0x52);
				resAmb = Rgb(0x9e, 0x9e, 0x9e);
			}
		}

		protected override void OnBarUpdate()
		{
			if (engine == null)
				return;
			if (tfError != null)
			{
				Draw.TextFixed(this, "nyoError", "NYOpenVolumenZonas: " + tfError, TextPosition.Center, Brushes.OrangeRed, labelFont, Brushes.Transparent, Brushes.Transparent, 0);
				return;
			}

			DateTime endNy = NyoTime.Convert(Time[0], ntZone, nyZone);
			DateTime startNy = endNy.AddMinutes(-barMinutes);
			bool lastBar = State == State.Realtime || CurrentBar >= Count - 2;

			if (ShowOpen)
			{
				engine.OnBar(startNy, endNy, Open[0], High[0], Low[0], Close[0], Volume[0]);
				if (engine.JustSettled != null && ShowResult)
					DrawResult(engine.JustSettled);
				if (engine.CandleClosed != null)
					DrawOpening(engine.CandleClosed);
			}

			if (ShowZones)
			{
				zones.OnBar(startNy, endNy, Open[0], High[0], Low[0], Close[0]);
				foreach (NyoZone z in zones.Removed)
				{
					RemoveDrawObject("nyoZ" + z.Id);
					RemoveDrawObject("nyoZL" + z.Id);
					RemoveDrawObject("nyoZT" + z.Id);
				}
				// Redraw only what changed; live zones are stretched to the last bar at the end of the history and in real time
				foreach (NyoZone z in zones.Zones)
					if (z.Changed || (lastBar && z.Live))
						DrawZone(z);
			}

			if (ShowOpen && lastBar)
				DrawTables(endNy);
		}

		// ─────────────────────────── 1 · Apertura ───────────────────────────
		private void DrawOpening(NyoSession x)
		{
			bool strong = x.Bucket == 0;
			Brush col = x.Dir == 0 || double.IsNaN(x.Rvol) || x.Rvol < LowRvol ? AmbBrush : x.Dir > 0 ? UpBrush : DownBrush;
			string tag = x.Date.ToString("yyyyMMdd", CultureInfo.InvariantCulture);

			if (ColorBar)
				BarBrush = strong ? col : Faded(col, 0.65);

			bool sigUp = (x.Bucket == 0 || x.Bucket == 1) && x.Dir > 0;
			bool sigDn = (x.Bucket == 0 || x.Bucket == 1) && x.Dir < 0;
			if (sigUp)
				Draw.TriangleUp(this, "nyoSig" + tag, false, 0, Low[0] - 3 * TickSize, UpBrush);
			else if (sigDn)
				Draw.TriangleDown(this, "nyoSig" + tag, false, 0, High[0] + 3 * TickSize, DownBrush);
			else if (x.Bucket == 2)
				Draw.Diamond(this, "nyoSig" + tag, false, 0, High[0] + 3 * TickSize, AmbBrush);

			if (ShowBox)
			{
				NinjaTrader.NinjaScript.DrawingTools.Rectangle r = Draw.Rectangle(this, "nyoBox" + tag, false, ToNt(x.FirstBarEnd), x.High, ToNt(x.End2), x.Low, col, col, strong ? 22 : 12);
				if (r != null && strong)
					r.OutlineStroke.Width = 2;
			}

			if (ShowLabel)
			{
				string vTxt = double.IsNaN(x.Rvol)
					? "Vol " + NyoFormat.Volume(x.Volume)
					: "Vol " + NyoFormat.Signed((x.Rvol - 1) * 100, "0") + "% vs " + (BaseType == NyoBase.Media ? "media" : "mediana")
						+ (double.IsNaN(x.Percentile) ? "" : " · p" + NyoFormat.Num(x.Percentile, "0"));
				string txt = x.Reading + "\n" + (x.Dir > 0 ? "Vela ▲ · " : x.Dir < 0 ? "Vela ▼ · " : "Vela ◆ · ") + vTxt;
				if (x.Bucket >= 0)
				{
					NyoBucketStats hb = engine.Buckets[x.Bucket];
					if (hb.N >= 5)
						txt += "\nHist.: siguió " + NyoFormat.Pct(hb.Sig2, hb.N) + " · contraria " + NyoFormat.Pct(hb.Con2, hb.N) + " (n=" + hb.N + ")";
				}
				Draw.Text(this, "nyoLbl" + tag, false, txt, ToNt(x.FirstBarEnd), x.Dir < 0 ? x.Low : x.High, x.Dir < 0 ? -45 : 45,
					Brushes.White, labelFont, TextAlignment.Center, col, col, 85);
			}

			if (State == State.Realtime && !double.IsNaN(x.Rvol) && x.Dir != 0)
				Alert("nyoOpen", Priority.High, Instrument.MasterInstrument.Name + " · apertura NY: " + x.Reading + " · RVOL " + NyoFormat.Num(x.Rvol, "0.00") + "x",
					NinjaTrader.Core.Globals.InstallDir + @"\sounds\Alert1.wav", 10, Brushes.Black, Brushes.White);
		}

		private void DrawResult(NyoSession t)
		{
			if (t.Range <= 0 || double.IsNaN(t.MoveR))
				return;
			string rt = (t.Outcome == NyoOutcome.Sigue ? "✔ siguió " : t.Outcome == NyoOutcome.Contraria ? "✖ contraria " : "≈ ambigua ") + NyoFormat.Signed(t.MoveR, "0.0") + "x";
			Brush rc = t.Outcome == NyoOutcome.Sigue ? resOk : t.Outcome == NyoOutcome.Contraria ? resBad : resAmb;
			Draw.Text(this, "nyoRes" + t.Date.ToString("yyyyMMdd", CultureInfo.InvariantCulture), false, rt, ToNt(t.T2), t.C2, 0,
				Brushes.White, smallFont, TextAlignment.Left, rc, rc, 80);
		}

		// ─────────────────────────── 2 · Zonas ───────────────────────────
		private void DrawZone(NyoZone z)
		{
			Brush line = z.Live ? ZoneLineBrush : zoneLineDim;
			Brush area = z.Live ? ZoneBrush : ZoneCrossedBrush;
			int opacity = z.Live ? ZoneOpacity : ZoneCrossedOpacity;
			DateTime left = ToNt(z.FirstBarEnd);
			DateTime right = ToNt(z.LastBarEnd);
			Draw.Rectangle(this, "nyoZ" + z.Id, false, left, z.Top, right, z.Bottom, line, area, opacity);
			if (ZoneShowLine && !double.IsNaN(z.LinePrice))
				Draw.Line(this, "nyoZL" + z.Id, false, left, z.LinePrice, right, z.LinePrice, line, DashStyleHelper.Dash, 1);
			if (ZoneShowText)
				Draw.Text(this, "nyoZT" + z.Id, false, zones.Label(z), left, z.Top, 10, line, smallFont, TextAlignment.Left, Brushes.Transparent, Brushes.Transparent, 0);
		}

		// ─────────────────────────── Tablas ───────────────────────────
		private void DrawTables(DateTime nowNy)
		{
			NyoSettings s = engine.Settings;
			NyoSession x = engine.Last;

			if (ShowToday)
			{
				StringBuilder sb = new StringBuilder();
				string baseName = BaseType == NyoBase.Media ? "Media" : "Mediana";
				sb.AppendLine(Row("APERTURA NY " + NyoFormat.HM(s, 0), x == null ? "—" : x.Date.ToString("dd/MM", CultureInfo.InvariantCulture)));
				if (x == null)
					sb.AppendLine("(sin vela de apertura en los datos cargados)");
				else
				{
					sb.AppendLine(Row("Vela", x.Dir > 0 ? "▲ alcista" : x.Dir < 0 ? "▼ bajista" : "◆ sin dirección"));
					sb.AppendLine(Row("Volumen", engine.HasVolume ? NyoFormat.Volume(x.Volume) : "sin volumen"));
					sb.AppendLine(Row(baseName + " " + Lookback + " ses.", NyoFormat.Volume(x.Base)));
					sb.AppendLine(Row("Diferencia", double.IsNaN(x.Rvol) ? "—" : NyoFormat.Signed((x.Rvol - 1) * 100, "0") + "%"
						+ (double.IsNaN(x.ZScore) ? "" : " · " + NyoFormat.Signed(x.ZScore, "0.0") + "σ")));
					sb.AppendLine(Row("Percentil", double.IsNaN(x.Percentile) ? "—" : "p" + NyoFormat.Num(x.Percentile, "0")));
					sb.AppendLine(Row("Lectura", x.Reading));
					string now = "—";
					if (x.Date == nowNy.Date && nowNy >= x.WindowEnd)
					{
						double mv;
						NyoOutcome o = engine.Classify(x, Close[0], out mv);
						if (o != NyoOutcome.None)
							now = NyoFormat.OutcomeText(o) + " " + NyoFormat.Signed(mv, "0.00") + "x";
					}
					sb.Append(Row("Ahora", now));
				}
				Brush todayBg = x == null || x.Bucket < 0 || x.Bucket == 2 ? AmbBrush : x.Dir > 0 ? UpBrush : DownBrush;
				Draw.TextFixed(this, "nyoHoy", sb.ToString(), TodayPosition, Brushes.White, tableFont, Brushes.DimGray, todayBg, 35);
			}

			if (ShowHistory)
			{
				string his = NyoReport.HistoryTable(engine, false).TrimEnd();
				int fewest = Math.Min(engine.Buckets[0].N, Math.Min(engine.Buckets[1].N, engine.Buckets[2].N));
				if (fewest < MinN)
					his += "\n(N < " + MinN + " en algún grupo: esos % son ruido)";
				Draw.TextFixed(this, "nyoHis", his, HistoryPosition, Brushes.WhiteSmoke, tableFont, Brushes.DimGray, Brushes.Black, 75);
			}
		}

		private static string Row(string a, string b)
		{
			return a.PadRight(16) + b;
		}

		// ─────────────────────────── Helpers ───────────────────────────
		private DateTime ToNt(DateTime ny)
		{
			return NyoTime.Convert(ny, nyZone, ntZone);
		}

		private static Brush Rgb(byte r, byte g, byte b)
		{
			SolidColorBrush brush = new SolidColorBrush(Color.FromRgb(r, g, b));
			brush.Freeze();
			return brush;
		}

		private static Brush Frozen(Brush b)
		{
			if (b == null || b.IsFrozen || !b.CanFreeze)
				return b;
			Brush c = b.Clone();
			c.Freeze();
			return c;
		}

		private static Brush Faded(Brush b, double opacity)
		{
			Brush c = b.Clone();
			c.Opacity = opacity;
			c.Freeze();
			return c;
		}

		#region Properties
		// ─────────────── 1 · Vela de apertura NY ───────────────
		[Display(Name = "Activar", Order = 1, GroupName = "1 · Vela de apertura NY")]
		public bool ShowOpen { get; set; }

		[Display(Name = "Zona horaria (id de Windows)", Description = "Eastern Standard Time = Nueva York (con horario de verano).", Order = 2, GroupName = "1 · Vela de apertura NY")]
		public string TimeZoneId { get; set; }

		[Range(0, 23)]
		[Display(Name = "Hora", Order = 3, GroupName = "1 · Vela de apertura NY")]
		public int OpenHour { get; set; }

		[Range(0, 59)]
		[Display(Name = "Min", Order = 4, GroupName = "1 · Vela de apertura NY")]
		public int OpenMinute { get; set; }

		[Range(1, 60)]
		[Display(Name = "Duración de la vela (min)", Order = 5, GroupName = "1 · Vela de apertura NY")]
		public int OpenLength { get; set; }

		// ─────────────── 2 · Volumen ───────────────
		[Range(3, 250)]
		[Display(Name = "Sesiones anteriores", Order = 1, GroupName = "2 · Volumen vs sesiones anteriores")]
		public int Lookback { get; set; }

		[Display(Name = "Comparar contra", Order = 2, GroupName = "2 · Volumen vs sesiones anteriores")]
		public NyoBase BaseType { get; set; }

		[Range(0, double.MaxValue)]
		[Display(Name = "Muy alto si supera la base en +%", Order = 3, GroupName = "2 · Volumen vs sesiones anteriores")]
		public double StrongPct { get; set; }

		[Range(0.1, double.MaxValue)]
		[Display(Name = "Bajo la media si RVOL <", Description = "RVOL = volumen de hoy / base. 1.0 = justo en la media.", Order = 4, GroupName = "2 · Volumen vs sesiones anteriores")]
		public double LowRvol { get; set; }

		// ─────────────── 3 · ¿Camina o no? ───────────────
		[Range(5, 1440)]
		[Display(Name = "Checkpoint 1 (min desde la apertura)", Description = "60 = 10:30 NY", Order = 1, GroupName = "3 · ¿Camina o no?")]
		public int Checkpoint1 { get; set; }

		[Range(5, 1440)]
		[Display(Name = "Checkpoint 2 (min desde la apertura)", Description = "390 = 16:00 NY", Order = 2, GroupName = "3 · ¿Camina o no?")]
		public int Checkpoint2 { get; set; }

		[Range(0.0, double.MaxValue)]
		[Display(Name = "Recorrido mínimo para SIGUE (x rango de la vela)", Description = "0 = basta con estar más allá del cierre de la vela. 0.5 = tiene que haber caminado al menos media vela.", Order = 3, GroupName = "3 · ¿Camina o no?")]
		public double MinMove { get; set; }

		[Display(Name = "Etiqueta de resultado en el checkpoint 2", Order = 4, GroupName = "3 · ¿Camina o no?")]
		public bool ShowResult { get; set; }

		[Range(1, int.MaxValue)]
		[Display(Name = "N mínimo para fiarse de los %", Order = 5, GroupName = "3 · ¿Camina o no?")]
		public int MinN { get; set; }

		// ─────────────── 4 · Visual apertura ───────────────
		[Display(Name = "Caja de la vela", Order = 1, GroupName = "4 · Visual apertura")]
		public bool ShowBox { get; set; }

		[Display(Name = "Etiqueta", Order = 2, GroupName = "4 · Visual apertura")]
		public bool ShowLabel { get; set; }

		[Display(Name = "Colorear la vela de apertura", Order = 3, GroupName = "4 · Visual apertura")]
		public bool ColorBar { get; set; }

		[Display(Name = "Tabla de hoy", Order = 4, GroupName = "4 · Visual apertura")]
		public bool ShowToday { get; set; }

		[Display(Name = "Tabla de hoy: posición", Order = 5, GroupName = "4 · Visual apertura")]
		public TextPosition TodayPosition { get; set; }

		[Display(Name = "Tabla histórica", Order = 6, GroupName = "4 · Visual apertura")]
		public bool ShowHistory { get; set; }

		[Display(Name = "Tabla histórica: posición", Order = 7, GroupName = "4 · Visual apertura")]
		public TextPosition HistoryPosition { get; set; }

		[XmlIgnore]
		[Display(Name = "Sigue ▲", Order = 8, GroupName = "4 · Visual apertura")]
		public Brush UpBrush { get; set; }

		[Browsable(false)]
		public string UpBrushSerializable
		{
			get { return Serialize.BrushToString(UpBrush); }
			set { UpBrush = Serialize.StringToBrush(value); }
		}

		[XmlIgnore]
		[Display(Name = "Sigue ▼", Order = 9, GroupName = "4 · Visual apertura")]
		public Brush DownBrush { get; set; }

		[Browsable(false)]
		public string DownBrushSerializable
		{
			get { return Serialize.BrushToString(DownBrush); }
			set { DownBrush = Serialize.StringToBrush(value); }
		}

		[XmlIgnore]
		[Display(Name = "Ambigua", Order = 10, GroupName = "4 · Visual apertura")]
		public Brush AmbBrush { get; set; }

		[Browsable(false)]
		public string AmbBrushSerializable
		{
			get { return Serialize.BrushToString(AmbBrush); }
			set { AmbBrush = Serialize.StringToBrush(value); }
		}

		// ─────────────── 5 · Zonas de cierre horario ───────────────
		[Display(Name = "Activar", Order = 1, GroupName = "5 · Zonas de cierre horario")]
		public bool ShowZones { get; set; }

		[Range(1, 25)]
		[Display(Name = "Min antes", Order = 2, GroupName = "5 · Zonas de cierre horario")]
		public int ZonePreMin { get; set; }

		[Range(1, 25)]
		[Display(Name = "Min después", Order = 3, GroupName = "5 · Zonas de cierre horario")]
		public int ZonePostMin { get; set; }

		[Display(Name = "Todas las horas (24h)", Order = 4, GroupName = "5 · Zonas de cierre horario")]
		public bool ZoneAllHours { get; set; }

		[Range(0, 23)]
		[Display(Name = "Cierres desde las", Order = 5, GroupName = "5 · Zonas de cierre horario")]
		public int ZoneFromHour { get; set; }

		[Range(0, 23)]
		[Display(Name = "hasta las", Description = "Hora NY del cierre de la vela de 1H. 10 → zona 09:55–10:05 · 16 → 15:55–16:05", Order = 6, GroupName = "5 · Zonas de cierre horario")]
		public int ZoneToHour { get; set; }

		[Display(Name = "Altura de la zona", Order = 7, GroupName = "5 · Zonas de cierre horario")]
		public NyoAltura ZoneHeight { get; set; }

		[Display(Name = "Extender", Description = "Cruzar = cerrar al otro lado de la zona después de haber estado del lado contrario.", Order = 8, GroupName = "5 · Zonas de cierre horario")]
		public NyoExtender ZoneExtend { get; set; }

		[Range(1, 500)]
		[Display(Name = "Horas (modo 'Horas fijas')", Order = 9, GroupName = "5 · Zonas de cierre horario")]
		public int ZoneExtendHours { get; set; }

		[Range(1, 200)]
		[Display(Name = "Zonas visibles (máx.)", Order = 10, GroupName = "5 · Zonas de cierre horario")]
		public int ZoneMax { get; set; }

		[Range(-25, 25)]
		[Display(Name = "Desplazar zona (min)", Description = "0 = centrada en el cierre horario. Pon -10 o +10 para ver zonas que NO están en el cierre de la hora y comparar cómo reacciona el precio.", Order = 11, GroupName = "5 · Zonas de cierre horario")]
		public int ZoneShift { get; set; }

		[Display(Name = "Línea en el precio del cierre", Order = 12, GroupName = "5 · Zonas de cierre horario")]
		public bool ZoneShowLine { get; set; }

		[Display(Name = "Texto: hora y toques", Order = 13, GroupName = "5 · Zonas de cierre horario")]
		public bool ZoneShowText { get; set; }

		[XmlIgnore]
		[Display(Name = "Zona", Order = 14, GroupName = "5 · Zonas de cierre horario")]
		public Brush ZoneBrush { get; set; }

		[Browsable(false)]
		public string ZoneBrushSerializable
		{
			get { return Serialize.BrushToString(ZoneBrush); }
			set { ZoneBrush = Serialize.StringToBrush(value); }
		}

		[Range(0, 100)]
		[Display(Name = "Zona: opacidad %", Order = 15, GroupName = "5 · Zonas de cierre horario")]
		public int ZoneOpacity { get; set; }

		[XmlIgnore]
		[Display(Name = "Borde/línea", Order = 16, GroupName = "5 · Zonas de cierre horario")]
		public Brush ZoneLineBrush { get; set; }

		[Browsable(false)]
		public string ZoneLineBrushSerializable
		{
			get { return Serialize.BrushToString(ZoneLineBrush); }
			set { ZoneLineBrush = Serialize.StringToBrush(value); }
		}

		[XmlIgnore]
		[Display(Name = "Cruzada", Order = 17, GroupName = "5 · Zonas de cierre horario")]
		public Brush ZoneCrossedBrush { get; set; }

		[Browsable(false)]
		public string ZoneCrossedBrushSerializable
		{
			get { return Serialize.BrushToString(ZoneCrossedBrush); }
			set { ZoneCrossedBrush = Serialize.StringToBrush(value); }
		}

		[Range(0, 100)]
		[Display(Name = "Cruzada: opacidad %", Order = 18, GroupName = "5 · Zonas de cierre horario")]
		public int ZoneCrossedOpacity { get; set; }
		#endregion
	}
}

#region NinjaScript generated code. Neither change nor remove.

namespace NinjaTrader.NinjaScript.Indicators
{
	public partial class Indicator : NinjaTrader.Gui.NinjaScript.IndicatorRenderBase
	{
		private NYOpenVolumenZonas[] cacheNYOpenVolumenZonas;
		public NYOpenVolumenZonas NYOpenVolumenZonas()
		{
			return NYOpenVolumenZonas(Input);
		}

		public NYOpenVolumenZonas NYOpenVolumenZonas(ISeries<double> input)
		{
			if (cacheNYOpenVolumenZonas != null)
				for (int idx = 0; idx < cacheNYOpenVolumenZonas.Length; idx++)
					if (cacheNYOpenVolumenZonas[idx] != null &&  cacheNYOpenVolumenZonas[idx].EqualsInput(input))
						return cacheNYOpenVolumenZonas[idx];
			return CacheIndicator<NYOpenVolumenZonas>(new NYOpenVolumenZonas(), input, ref cacheNYOpenVolumenZonas);
		}
	}
}

namespace NinjaTrader.NinjaScript.MarketAnalyzerColumns
{
	public partial class MarketAnalyzerColumn : MarketAnalyzerColumnBase
	{
		public Indicators.NYOpenVolumenZonas NYOpenVolumenZonas()
		{
			return indicator.NYOpenVolumenZonas(Input);
		}

		public Indicators.NYOpenVolumenZonas NYOpenVolumenZonas(ISeries<double> input )
		{
			return indicator.NYOpenVolumenZonas(input);
		}
	}
}

namespace NinjaTrader.NinjaScript.Strategies
{
	public partial class Strategy : NinjaTrader.Gui.NinjaScript.StrategyRenderBase
	{
		public Indicators.NYOpenVolumenZonas NYOpenVolumenZonas()
		{
			return indicator.NYOpenVolumenZonas(Input);
		}

		public Indicators.NYOpenVolumenZonas NYOpenVolumenZonas(ISeries<double> input )
		{
			return indicator.NYOpenVolumenZonas(input);
		}
	}
}

#endregion
