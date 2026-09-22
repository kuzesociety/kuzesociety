/** Research & odds: what is proven, how the pump.fun game works, what a trade costs. */
import { useMemo, useState } from "preact/hooks";
import { LAMPORTS_PER_SOL, curveBuyQuote, newCurve } from "../core/curve";
import { breakEvenP } from "../core/model";
import { DEFAULT_COSTS, quoteBuy, quoteSell } from "../core/positions";
import { TokenState } from "../core/token";
import { Tag } from "../web/ui";

/** Immediate buy-then-sell cost at a given size, from the engine's own fee and curve code. */
function roundTrips(sizes: number[]) {
  const t = new TokenState("research", 0);
  const c = curveBuyQuote(newCurve(), 12 * LAMPORTS_PER_SOL).after;
  Object.assign(t, { vSol: c.vSol, vTok: c.vTok, realTok: c.realTok });
  t.refreshPrice();
  const rows = sizes.map((size) => {
    const b = quoteBuy(t, size * LAMPORTS_PER_SOL, DEFAULT_COSTS, 0, true);
    const s = quoteSell(t, b.tokens, DEFAULT_COSTS, 0, true);
    return { size, cost: 1 - s.lamports / (size * LAMPORTS_PER_SOL) };
  });
  return { mcapSol: t.mcapSol, rows };
}

const PLAYERS: { who: string; wants: string; tell: string; signal: string }[] = [
  {
    who: "Launchers (devs)",
    wants: "Sell their own supply into buyers and earn the creator fee on every trade.",
    tell: "Big dev holding, dev selling early, many launches from one wallet in a day.",
    signal: "Dev holding, dev-sold share, launches in 24 h and the creator's past coins are score inputs; filters can block them.",
  },
  {
    who: "Bundlers & insiders",
    wants: "Take most of the supply in the launch block through many wallets, then sell into the first wave.",
    tell: "A large share of supply bought in the launch block.",
    signal: "Launch-bundle share is a score input and a filter (25% max by default).",
  },
  {
    who: "Snipers",
    wants: "Be first in the opening blocks and flip at 1.5–3×. Their edge is speed: paid priority, tips, servers next to validators.",
    tell: "Supply still held by block-zero buyers — their exit is your drawdown.",
    signal: "Does not race them. It waits for demand beyond the sniper wave and tracks how much sniper supply is left.",
  },
  {
    who: "Callers & alpha groups",
    wants: "Buy before posting, then sell to the followers who arrive.",
    tell: "A sudden burst of new wallets and a tweet link after a quiet period.",
    signal: "Buyer acceleration, fresh-wallet share and socials are inputs; the Learn tab measures whether those bursts pay or are exit liquidity.",
  },
  {
    who: "Smart wallets",
    wants: "Repeatable profit. They are selective and early.",
    tell: "A credible record of realized wins across many coins.",
    signal: "Learned from the order flow with a pessimistic prior, because luck across thousands of wallets creates fake “smart money”.",
  },
  {
    who: "Copy-trade bots",
    wants: "Mirror known wallets automatically.",
    tell: "A cluster of buys seconds after a tracked wallet buys.",
    signal: "Counted as demand, but the score predicts what happens next, not who bought — following a crowd is only rewarded if it paid in the data.",
  },
  {
    who: "Late buyers",
    wants: "The next 100× after it is already trending.",
    tell: "Rising market cap while new money per buyer shrinks.",
    signal: "They are who everyone above sells to. The bot sells to them at your target instead of hoping.",
  },
  {
    who: "The venue & validators",
    wants: "Fees on every trade and paid transaction ordering.",
    tell: "Always there: 1.25% per side on the curve, tiered fees on PumpSwap, priority fees and tips.",
    signal: "Every fee is inside the take-profit, stop-loss and measured results. Size is kept where costs are lowest.",
  },
];

const LIFE: { t: string; what: string; note: string }[] = [
  { t: "0 s", what: "Launch", note: "The dev buys first; snipers and bundles fill the opening blocks." },
  { t: "0–5 min", what: "First wave", note: "Bots flip, most coins stall. SIGNAL samples every coin at 20 s, 45 s, 90 s, 3, 6 and 12 min." },
  { t: "25 · 50 · 75%", what: "Curve filling", note: "More checkpoints at each quarter of the curve — the coins still climbing are the only ones that matter." },
  { t: "≈85 SOL raised", what: "Graduation", note: "Market cap ≈411 SOL; the coin moves to PumpSwap. Only about 1–3% of launches ever get here." },
  { t: "After", what: "Second act", note: "DexScreener listing, paid boosts, calls: a second wave or a slow bleed into late buyers. Checkpoints at 1, 5, 15 and 60 min." },
];

const CHECKS = [
  "The server runs 24/7 with a volume at /data, and Telegram answers /status",
  "More → Health shows the Solana RPC trade stream green",
  "Several days of paper trading at your exact score, TP and SL",
  "Learn → go-live check is green: 150+ resolved signals, 95% lower bound above +2% per trade",
  "A new Phantom wallet used only by the bot, funded with money you can lose",
  "LIVE_MAX_POSITION_SOL (0.05–0.1) and LIVE_MAX_DAILY_LOSS_SOL set on the server",
  "First 50 live trades at the smallest size; compare live fills with paper before sizing up",
];

const CHECK_KEY = "signal-demo-golive-v1";

function loadChecks(): boolean[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHECK_KEY) ?? "[]");
    return Array.isArray(v) ? v.map(Boolean) : [];
  } catch {
    return [];
  }
}

export function Research() {
  const costs = useMemo(() => roundTrips([0.05, 0.1, 0.25, 0.5, 1, 2]), []);
  const [tp, setTp] = useState(100);
  const [sl, setSl] = useState(50);
  const [win, setWin] = useState(40);
  const [gap, setGap] = useState(10);
  const [checks, setChecks] = useState<boolean[]>(loadChecks);
  const be = breakEvenP(tp, sl, gap / 100);
  const ev = (win / 100) * (tp / 100) - (1 - win / 100) * ((sl + gap) / 100);
  const toggle = (i: number) => {
    const next = CHECKS.map((_, k) => (k === i ? !checks[k] : !!checks[k]));
    setChecks(next);
    try {
      localStorage.setItem(CHECK_KEY, JSON.stringify(next));
    } catch {
      /* storage blocked: the list resets next visit */
    }
  };
  const num = (v: string, lo: number, hi: number, d: number) => {
    const x = Number(v);
    return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d;
  };

  return (
    <div class="grid research">
      <div class="card">
        <h2>Where things stand</h2>
        <div class="grid two">
          <div>
            <p class="lede good">Proven by the test suite</p>
            <ul class="ticks">
              <li>Bonding-curve and PumpSwap math match the integer math of pump.fun's official SDKs.</li>
              <li>Event decoders follow pump.fun's published program layouts (current and older versions) and never crash on garbage.</li>
              <li>Paper accounting balances to within 0.00000001 SOL; after a hard crash the server restores positions and settings.</li>
              <li>
                The learning pipeline finds a planted edge (AUC 0.93 → 0.98 after training) and refuses a fake one (AUC 0.51, go-live check stays red).
              </li>
              <li>12 simulated hours, 3.9 M events: zero errors; memory is bounded by capped caches and a heap watchdog.</li>
              <li>
                Entry timing fixed: with your plan (75, 2×, −50%) in two simulated markets, the old logic lost 0.58–0.59 SOL over 6 hours; buying each coin once, at its
                first real crossing, made 0.27–0.44 SOL. Simulated markets, so this proves the logic, not the profit.
              </li>
            </ul>
          </div>
          <div>
            <p class="lede warn">Not proven yet — by anyone</p>
            <ul class="ticks">
              <li>That score 75+ makes money on the real market. Nobody can know that without recording the live market at your settings.</li>
              <li>
                The server starts recording on day one: every coin is followed as if bought with your size and delay. The go-live check turns green only when the evidence says so.
              </li>
              <li>This demo's market is simulated. Its wins and losses show how the bot behaves, not what it will earn.</li>
            </ul>
          </div>
        </div>
      </div>

      <div class="section-title">
        <h2>The game</h2>
        <span class="faint">who is on the other side of every trade</span>
      </div>
      <div class="card flat">
        <p style="margin:0">
          Every trade pays fees that leave the table, so the average participant loses. Profit only comes from being <b>consistently earlier or more selective</b> than the
          people you sell to. SIGNAL does not try to out-race snipers — a speed war a retail bot loses. It waits for evidence of real demand in the first minutes, and exits
          mechanically.
        </p>
      </div>
      <div class="players">
        {PLAYERS.map((p) => (
          <div class="card player" key={p.who}>
            <h3>{p.who}</h3>
            <dl>
              <dt>Wants</dt>
              <dd>{p.wants}</dd>
              <dt>Tell</dt>
              <dd>{p.tell}</dd>
              <dt>SIGNAL</dt>
              <dd>{p.signal}</dd>
            </dl>
          </div>
        ))}
      </div>

      <div class="section-title">
        <h2>A coin's life</h2>
        <span class="faint">and where SIGNAL looks</span>
      </div>
      <ol class="life card">
        {LIFE.map((s) => (
          <li key={s.t}>
            <span class="when num">{s.t}</span>
            <div>
              <b>{s.what}</b>
              <div class="muted">{s.note}</div>
            </div>
          </li>
        ))}
      </ol>

      <div class="section-title">
        <h2>What a trade costs</h2>
      </div>
      <div class="grid two">
        <div class="card">
          <h2>Round trip by size</h2>
          <div class="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Size</th>
                  <th class="r">Buy + sell cost</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {costs.rows.map((r) => (
                  <tr key={r.size}>
                    <td class="num">{r.size} SOL</td>
                    <td class="r num">{(r.cost * 100).toFixed(1)}%</td>
                    <td style="width:45%">
                      <div class="bar" style="margin:0">
                        <i style={`width:${Math.min(100, (r.cost / 0.12) * 100)}%`} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p class="faint note">
            Computed live by the engine's fee code for a coin at {costs.mcapSol.toFixed(0)} SOL market cap: pump.fun 1.25% each way, PumpPortal 0.5% each way, 0.0005 SOL
            priority fee per transaction and your own price impact. Token-account rent is refunded on close. Small sizes pay the fixed fee; big ones move the price against
            themselves — 0.1–0.25 SOL is the sweet spot on the curve.
          </p>
        </div>
        <div class="card">
          <h2>Win rate you need</h2>
          <div class="calc">
            <label>
              Take profit
              <span class="unit">
                <input class="inp" type="number" inputMode="decimal" value={tp} onInput={(e) => setTp(num((e.target as HTMLInputElement).value, 5, 2000, 100))} />%
              </span>
            </label>
            <label>
              Stop loss
              <span class="unit">
                <input class="inp" type="number" inputMode="decimal" value={sl} onInput={(e) => setSl(num((e.target as HTMLInputElement).value, 5, 95, 50))} />%
              </span>
            </label>
            <label>
              Stop slips past line
              <span class="unit">
                <input class="inp" type="number" inputMode="decimal" value={gap} onInput={(e) => setGap(num((e.target as HTMLInputElement).value, 0, 50, 10))} />%
              </span>
            </label>
            <label>
              Trades that win
              <span class="unit">
                <input class="inp" type="number" inputMode="decimal" value={win} onInput={(e) => setWin(num((e.target as HTMLInputElement).value, 0, 100, 40))} />%
              </span>
            </label>
          </div>
          <div class="verdict">
            <div>
              <div class="k">Break-even</div>
              <div class="v num">{(be * 100).toFixed(1)}%</div>
              <div class="s">of trades must hit the target</div>
            </div>
            <div>
              <div class="k">Per trade</div>
              <div class={`v num ${ev > 0 ? "good" : ev < 0 ? "bad" : ""}`}>
                {ev >= 0 ? "+" : ""}
                {(ev * 100).toFixed(1)}%
              </div>
              <div class="s">of the stake, on average</div>
            </div>
          </div>
          <p class="faint note">
            TP and SL are measured after all fees, so the only extra is the stop filling below its line in a fast dump. Your plan — 2× or −50% — needs about{" "}
            {(breakEvenP(100, 50) * 100).toFixed(0)} winners in every 100 trades.
          </p>
        </div>
      </div>

      <div class="section-title">
        <h2>Will it actually get in?</h2>
      </div>
      <div class="card">
        <ul class="ticks">
          <li>
            <b>Score only</b> makes the score the only gate. The bot buys any coin that reaches your number; token filters are ignored and only your budget limits apply.
          </li>
          <li>
            <b>One entry moment per coin</b>: the first time its score reaches your number and holds for about 5 seconds. In simulation, the same coins bought again after
            a dip lost about 40% per trade — fading coins whose running totals still look strong.
          </li>
          <li>
            Buys are <b>market orders</b> with room for the price to move (20% by default), not limit orders at a perfect price. If the price runs further before the buy lands,
            the buy fails as it would on-chain and the bot retries for 20 seconds while the score still holds.
          </li>
          <li>The score slider shows how many coins per hour recently reached each value, so you can pick a number that actually happens.</li>
          <li>
            <b>Why no trades?</b> on the Bot tab lists what blocked each signal in the last hour — paused, warming up, limits, failed fills.
          </li>
          <li>Paper mode waits 1.5 s before filling and uses the price at landing, so paper results are not flattering.</li>
        </ul>
      </div>

      <div class="section-title">
        <h2>Before real money</h2>
        <Tag tone={checks.filter(Boolean).length === CHECKS.length ? "good" : "warn"}>
          {checks.filter(Boolean).length}/{CHECKS.length}
        </Tag>
      </div>
      <div class="card checklist">
        {CHECKS.map((c, i) => (
          <label key={c}>
            <input type="checkbox" checked={!!checks[i]} onChange={() => toggle(i)} />
            <span>{c}</span>
          </label>
        ))}
      </div>

      <div class="card flat sources">
        <h2>Sources</h2>
        <ul>
          <li>
            <a href="https://pump.fun/docs/fees" target="_blank" rel="noopener">
              pump.fun — fees
            </a>{" "}
            and{" "}
            <a href="https://github.com/pump-fun/pump-public-docs" target="_blank" rel="noopener">
              public program docs
            </a>
          </li>
          <li>
            <a href="https://pumpportal.fun/data-api/real-time" target="_blank" rel="noopener">
              PumpPortal real-time data
            </a>{" "}
            and{" "}
            <a href="https://pumpportal.fun/fees" target="_blank" rel="noopener">
              fees
            </a>
          </li>
          <li>
            <a href="https://docs.dexscreener.com/api/reference" target="_blank" rel="noopener">
              DexScreener API reference
            </a>
          </li>
          <li>
            Graduation rates:{" "}
            <a href="https://solanacompass.com/news/pumpfun-launched-42000-tokens-in-one-day-fewer-than-2-will-ever-reach-a-dex" target="_blank" rel="noopener">
              Solana Compass
            </a>
            ,{" "}
            <a href="https://dune.com/jondar/pumpfun" target="_blank" rel="noopener">
              Dune dashboard
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}
