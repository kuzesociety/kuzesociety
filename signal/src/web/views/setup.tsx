/** Setup with buttons instead of files: market data, Telegram, paper trading, phone, going live. */
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { ext } from "../ext";
import { api, navigate, toast, useApp } from "../store";
import { Tag } from "../ui";

interface SetupStatus {
  supervised: boolean;
  local: boolean;
  privateChannel: boolean;
  rpc: { host: string; isPublic: boolean };
  stream: {
    source: "public" | "rpc";
    chosen: "public" | "rpc";
    budgetMb: number;
    ammFirehose: boolean;
    feed: {
      host: string;
      status: string;
      msgs: number;
      mbPerDay: number | null;
      netMbPerDay: number | null;
      budget: { usedMb: number; limitMb: number; onFree: boolean } | null;
    } | null;
  };
  telegram: { tokenSet: boolean; linked: boolean; code: string | null };
  live: { enabled: boolean; pendingRestart: boolean; walletSet: boolean; address: string | null; maxPositionSol: number; maxDailyLossSol: number; ready: boolean };
  phoneUrl: string | null;
  anywhereUrl: string | null;
  update: { current: string | null; latest: string | null; checkedAt: number; available: boolean; can: boolean; why: string | null; state: string; error: string | null } | null;
}

function ago(ts: number) {
  const m = Math.round((Date.now() - ts) / 60_000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

/** Helius meters websocket data at about 20 credits per MB (their April 2026 rate). */
const CREDITS_PER_MB = 20;
const FREE_CREDITS_PER_DAY = 1_000_000 / 30;

function copy(text: string, what: string) {
  try {
    navigator.clipboard.writeText(text).then(
      () => toast(`${what} copied`),
      () => toast("Select the text and copy it"),
    );
  } catch {
    toast("Select the text and copy it");
  }
}

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: ComponentChildren }) {
  return (
    <div class={`card step ${done ? "done" : ""}`}>
      <div class="row" style="gap:10px;margin-bottom:8px">
        <span class="stepno">{done ? "✓" : n}</span>
        <b style="flex:1;font-size:15px">{title}</b>
        {done && <Tag tone="good">done</Tag>}
      </div>
      {children}
    </div>
  );
}

export function SetupView() {
  const settings = useApp((s) => s.settings);
  const [st, setSt] = useState<SetupStatus | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [busy, setBusy] = useState("");
  const [rpcKey, setRpcKey] = useState("");
  const [budgetMb, setBudgetMb] = useState("");
  const [tgToken, setTgToken] = useState("");
  const [wallet, setWallet] = useState("");
  const [maxPos, setMaxPos] = useState("0.05");
  const [maxLoss, setMaxLoss] = useState("0.25");
  const [phrase, setPhrase] = useState("");

  const load = () =>
    api<SetupStatus>("/api/setup")
      .then((x) => {
        setSt(x);
        setRestarting(false);
      })
      .catch(() => {});
  useEffect(() => {
    if (ext.demo) return;
    void load();
    const t = setInterval(load, 4_000);
    return () => clearInterval(t);
  }, []);

  if (ext.demo) {
    return (
      <div class="card">
        <h2>Setup</h2>
        <p style="margin-top:0">
          On your own bot this page sets everything up with buttons — no files to edit: the market-data key, Telegram alerts, a link for your phone, and going live with a
          wallet when you decide to.
        </p>
        <button class="btn primary" onClick={() => navigate("more", "deploy")}>
          How to install the real bot
        </button>
      </div>
    );
  }
  if (!st) return <div class="empty">Loading…</div>;

  const act = async (key: string, path: string, body: Record<string, unknown>, ok: (r: any) => void) => {
    setBusy(key);
    try {
      const r = await api<any>(path, body);
      ok(r);
      if (r.restarting) setRestarting(true);
      else if (r.note) toast(r.note);
      void load();
    } catch (e) {
      toast(String((e as Error).message));
    } finally {
      setBusy("");
    }
  };

  const feed = st.stream.feed;
  const feedOk = feed?.status === "open";
  const credits = feed?.mbPerDay ? feed.mbPerDay * CREDITS_PER_MB : null;
  const cap = Number(budgetMb || st.stream.budgetMb);
  const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

  const u = st.update;
  const updating = busy === "update";
  const updateCard = u && (
    <div class={`card step ${u.available ? "hot" : u.can && u.checkedAt ? "done" : ""}`}>
      <div class="row" style="gap:10px;margin-bottom:8px">
        <span class="stepno">{u.available ? "↑" : u.can && u.checkedAt ? "✓" : "↻"}</span>
        <b style="flex:1;font-size:15px">{u.available ? "A new version of SIGNAL is ready" : u.can && u.checkedAt ? "SIGNAL is up to date" : "Updates"}</b>
        {u.current && (
          <span class="faint num" title="this bot's version">
            v {u.current.slice(0, 7)}
          </span>
        )}
      </div>
      {u.available && u.can && (
        <>
          <p class="muted" style="margin:0 0 8px">
            One tap: the bot downloads it, restarts by itself in about a minute, and keeps your keys, settings, history and open trades.
          </p>
          <button
            class="btn primary"
            disabled={!!busy}
            onClick={() => act("update", "/api/setup/update", {}, (r) => r.version && toast(`Installed ${String(r.version).slice(0, 7)} — restarting`))}
          >
            {updating ? (u.state === "installing" ? "Installing…" : "Downloading…") : "Update now"}
          </button>
        </>
      )}
      {u.available && !u.can && (
        <p class="muted" style="margin:0">
          {u.why}
        </p>
      )}
      {!u.available && (
        <div class="row wrap" style="gap:8px">
          <span class="faint" style="flex:1">
            {!u.can ? u.why : u.checkedAt ? `Checked ${ago(u.checkedAt)} · checks by itself every few hours.` : "Checks by itself every few hours."}
          </span>
          {u.can && (
            <button
              class="btn sm ghost"
              disabled={!!busy}
              onClick={() => act("check", "/api/setup/update-check", {}, (r) => toast(r.update?.available ? "A new version is ready" : r.update?.checkedAt ? "Up to date" : "Could not reach GitHub — try later"))}
            >
              {busy === "check" ? "Checking…" : "Check now"}
            </button>
          )}
        </div>
      )}
      {u.state === "failed" && u.error && !updating && (
        <p class="note" style="color:var(--bad);margin-bottom:0">
          Last try: {u.error}
        </p>
      )}
    </div>
  );

  return (
    <div class="grid setup">
      {restarting && <div class="banner sim" style="margin:0;width:100%">Restarting the bot to apply it — this page reconnects by itself in a few seconds.</div>}
      {u?.available && updateCard}

      <Step n={1} title="Market data" done={feedOk}>
        <p class="muted" style="margin-top:0">
          Every pump.fun trade comes from the <b>free public Solana feed</b> — no key, no account, no cost. Coins that graduate to PumpSwap are followed one by one while they
          matter (the ones you hold, and fresh graduates for an hour).
        </p>
        <p class="faint note" style="margin-top:0">
          Now:{" "}
          {feed
            ? `${st.stream.source === "rpc" ? "through your key" : "free public feed"} (${feed.host}) · ${feed.status}, ${feed.msgs.toLocaleString("en-US")} messages`
            : "not connected"}
          {feed && (feed.netMbPerDay ?? feed.mbPerDay) !== null && ` · about ${fmt(feed.netMbPerDay ?? feed.mbPerDay!)} MB a day of internet`}
          {feed?.budget &&
            ` · today ${fmt(feed.budget.usedMb)} of ${fmt(feed.budget.limitMb)} MB through your key${feed.budget.onFree ? " — cap reached, on the free feed until 00:00 UTC" : ""}`}
        </p>

        <b style="display:block;margin:10px 0 4px">Your RPC key (optional)</b>
        <p class="muted" style="margin:0 0 8px">
          Needed only to send orders when you go live. A free Helius key is enough: sign up at{" "}
          <a href="https://dashboard.helius.dev" target="_blank" rel="noopener">
            dashboard.helius.dev
          </a>
          , open <b>API Keys</b>, copy the key and paste it here. {st.rpc.isPublic ? "No key saved yet." : `Key saved (${st.rpc.host}).`}
        </p>
        <div class="row wrap" style="gap:8px">
          <input class="inp wide" type="password" autoComplete="off" placeholder="Helius API key" value={rpcKey} onInput={(e) => setRpcKey((e.target as HTMLInputElement).value)} />
          <button class="btn" disabled={!rpcKey || !!busy} onClick={() => act("rpc", "/api/setup/rpc", { key: rpcKey }, () => setRpcKey(""))}>
            {busy === "rpc" ? "Testing…" : "Save key"}
          </button>
        </div>

        {!st.rpc.isPublic && (
          <>
            <b style="display:block;margin:14px 0 4px">Stream trades through your key instead?</b>
            <p class="muted" style="margin:0 0 8px">
              Only if the free feed keeps dropping. Keys are billed by data: Helius charges about {CREDITS_PER_MB} credits per MB, and its free plan has about{" "}
              {fmt(FREE_CREDITS_PER_DAY)} credits a day.
              {credits !== null && ` The stream measured now is about ${fmt(feed!.mbPerDay!)} MB a day — about ${fmt(credits)} credits a day through a key.`} With a daily cap the
              key carries the stream until the cap, then the free feed takes over until 00:00 UTC.
            </p>
            <div class="row wrap" style="gap:8px;align-items:center">
              <div class="chips">
                <button class="chip" aria-pressed={st.stream.chosen === "public"} disabled={!!busy} onClick={() => act("stream", "/api/setup/stream", { source: "public", budgetMb: cap }, () => {})}>
                  Free public feed
                </button>
                <button class="chip" aria-pressed={st.stream.chosen === "rpc"} disabled={!!busy} onClick={() => act("stream", "/api/setup/stream", { source: "rpc", budgetMb: cap }, () => {})}>
                  Through my key
                </button>
              </div>
              <label class="row" style="gap:6px">
                at most
                <input class="inp" style="max-width:90px" inputMode="numeric" value={budgetMb || String(st.stream.budgetMb)} onInput={(e) => setBudgetMb((e.target as HTMLInputElement).value)} />
                MB a day ≈ {fmt(cap * CREDITS_PER_MB)} credits
              </label>
            </div>
          </>
        )}
      </Step>

      <Step n={2} title="Telegram alerts (optional)" done={st.telegram.linked}>
        {st.telegram.linked ? (
          <p class="muted" style="margin:0">
            Linked. You get a message for every buy and sell, and can send /status, /pause, /resume, /score 75, /tp 100, /sl 50, /hold 10, /kill.
          </p>
        ) : st.telegram.code ? (
          <p style="margin:0">
            Now open your new bot in Telegram and send it this code: <b class="num linkcode">{st.telegram.code}</b>
            <span class="faint"> — this page turns green when it arrives.</span>
          </p>
        ) : (
          <>
            <ol class="steps" style="margin:0 0 8px">
              <li>
                In Telegram, open <b>@BotFather</b> and send <code>/newbot</code>.
              </li>
              <li>Pick any name, then a username ending in "bot".</li>
              <li>Copy the token it gives you (looks like 123456789:AAH…) and paste it here.</li>
            </ol>
            <div class="row wrap" style="gap:8px">
              <input class="inp wide" type="password" autoComplete="off" placeholder="Bot token from @BotFather" value={tgToken} onInput={(e) => setTgToken((e.target as HTMLInputElement).value)} />
              <button class="btn primary" disabled={!tgToken || !!busy} onClick={() => act("tg", "/api/setup/telegram", { token: tgToken }, () => setTgToken(""))}>
                {busy === "tg" ? "Checking…" : "Connect"}
              </button>
            </div>
          </>
        )}
        {st.telegram.tokenSet && (
          <button class="btn sm ghost" style="margin-top:6px" onClick={() => act("tgoff", "/api/setup/telegram-off", {}, () => toast("Telegram disconnected"))}>
            Disconnect Telegram
          </button>
        )}
      </Step>

      <Step n={3} title="Paper trading" done={!!settings?.enabled && settings.mode === "paper"}>
        <p class="muted" style="margin:0 0 8px">
          Fake money on the real market. Bot tab → pick a <b>Strategy</b> → switch <b>Auto-trading</b> on. Leave it running for days; the Learn tab tells you when the evidence is
          strong enough to go live.
        </p>
        <button class="btn" onClick={() => navigate("bot")}>
          Open the Bot tab
        </button>
      </Step>

      <Step n={4} title="Your phone" done={!!st.anywhereUrl}>
        <p class="muted" style="margin:0 0 8px">
          Telegram works anywhere with nothing more to set up: /status, /strategy, /score 75, /pause, /update… For the full dashboard on your phone:
        </p>
        {st.anywhereUrl ? (
          <>
            <b style="display:block;margin-bottom:4px">Anywhere (Tailscale)</b>
            <div class="copyline">
              <code>{st.anywhereUrl}</code>
              <button class="btn sm" onClick={() => copy(st.anywhereUrl!, "Link")}>
                Copy
              </button>
            </div>
            <p class="faint note">Open it on your phone and add it to your home screen. Telegram's /link sends it to you too.</p>
          </>
        ) : (
          <ol class="steps" style="margin:0 0 8px">
            <li>
              Install{" "}
              <a href="https://tailscale.com/download" target="_blank" rel="noopener">
                Tailscale
              </a>{" "}
              (free) on this computer and sign in (Google works).
            </li>
            <li>Install the Tailscale app on your phone and sign in with the same account.</li>
            <li>A link that works anywhere appears here in a minute — and Telegram's /link sends it to your phone.</li>
          </ol>
        )}
        {st.phoneUrl && (
          <>
            <b style="display:block;margin:10px 0 4px">At home (same Wi-Fi)</b>
            <div class="copyline">
              <code>{st.phoneUrl}</code>
              <button class="btn sm" onClick={() => copy(st.phoneUrl!, "Link")}>
                Copy
              </button>
            </div>
          </>
        )}
      </Step>

      <Step n={5} title="Go live with real money — only when ready" done={st.live.enabled && st.live.ready}>
        {st.live.enabled ? (
          <>
            <p style="margin:0 0 6px">
              Live trading is allowed with wallet{" "}
              <code>
                {st.live.address?.slice(0, 4)}…{st.live.address?.slice(-4)}
              </code>{" "}
              · max {st.live.maxPositionSol} SOL per trade · stops for the day after losing {st.live.maxDailyLossSol} SOL.{" "}
              {st.live.ready ? "Switch Bot tab → Mode → Live to start." : "The wallet is not ready yet (check More → Health)."}
            </p>
            <div class="row wrap" style="gap:8px">
              <button class="btn" onClick={() => navigate("bot")}>
                Open the Bot tab
              </button>
              <button class="btn danger" disabled={!!busy} onClick={() => act("off", "/api/setup/live-off", {}, () => toast("Live trading off — back to paper"))}>
                Turn live off
              </button>
            </div>
          </>
        ) : !st.privateChannel ? (
          <p class="muted" style="margin:0">For safety, a wallet can only be added on the computer running the bot — open http://localhost:8787 there.</p>
        ) : (
          <>
            {st.rpc.isPublic && (
              <p class="note warn" style="margin-top:0">Save your free Helius key in step 1 first: orders are sent through it (the public endpoint is slow for sending).</p>
            )}
            <ol class="steps" style="margin:0 0 10px">
              <li>In Phantom, create a new account used only by the bot, and send it the SOL you can afford to lose.</li>
              <li>Phantom → Settings → Manage accounts → that account → Show private key. Copy it.</li>
              <li>Paste it below. It stays on this computer and is never shown again.</li>
            </ol>
            <div class="grid" style="gap:8px">
              <input class="inp wide" type="password" autoComplete="off" placeholder={st.live.walletSet ? "Wallet saved — paste only to replace it" : "Bot wallet private key"} value={wallet} onInput={(e) => setWallet((e.target as HTMLInputElement).value)} />
              <label class="row" style="gap:8px">
                <span style="flex:1">Max SOL per trade</span>
                <input class="inp" inputMode="decimal" value={maxPos} onInput={(e) => setMaxPos((e.target as HTMLInputElement).value)} />
              </label>
              <label class="row" style="gap:8px">
                <span style="flex:1">Stop for the day after losing (SOL)</span>
                <input class="inp" inputMode="decimal" value={maxLoss} onInput={(e) => setMaxLoss((e.target as HTMLInputElement).value)} />
              </label>
              <input class="inp wide" autoComplete="off" placeholder='Type "I understand the risk"' value={phrase} onInput={(e) => setPhrase((e.target as HTMLInputElement).value)} />
              <button
                class="btn danger"
                disabled={(!wallet && !st.live.walletSet) || !phrase || !!busy}
                onClick={() =>
                  act("live", "/api/setup/live", { walletKey: wallet, maxPositionSol: Number(maxPos), maxDailyLossSol: Number(maxLoss), confirm: phrase }, (r) => {
                    setWallet("");
                    setPhrase("");
                    toast(`Live allowed for wallet ${String(r.address).slice(0, 4)}…${String(r.address).slice(-4)}`);
                  })
                }
              >
                Allow live trading
              </button>
            </div>
            <p class="faint note">After the restart, switch Bot tab → Mode → Live. The limits above cannot be raised from the Bot tab.</p>
          </>
        )}
        {st.live.walletSet && st.privateChannel && (
          <button class="btn sm ghost" style="margin-top:6px" onClick={() => act("rm", "/api/setup/wallet-remove", {}, () => toast("Wallet removed from this bot"))}>
            Remove the wallet from this bot
          </button>
        )}
      </Step>

      {!u?.available && updateCard}

      {!st.supervised && (
        <p class="faint note">
          This bot was started without its starter script, so after saving you will need to close it and start it again. Use start-windows.bat (or start-mac.command) so this
          happens by itself.
        </p>
      )}
    </div>
  );
}
