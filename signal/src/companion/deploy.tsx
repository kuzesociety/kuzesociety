/** Set up the real bot: a server config generated in the page, and the steps for each host. */
import { useMemo, useRef, useState } from "preact/hooks";

const REPO = "kuzesociety/kuzesociety";
const BRANCH = "claude/signal-meme-trading-bot-o142hw";

type Host = "railway" | "render" | "vps" | "windows";

function newToken() {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function CopyBlock({ text }: { text: string }) {
  const ref = useRef<HTMLPreElement>(null);
  const [msg, setMsg] = useState("");
  const selectAll = () => {
    const sel = window.getSelection();
    if (ref.current && sel) {
      sel.removeAllRanges();
      sel.selectAllChildren(ref.current);
    }
    setMsg("Selected — use your phone's Copy");
  };
  const copy = () => {
    try {
      navigator.clipboard.writeText(text).then(() => setMsg("Copied"), selectAll);
    } catch {
      selectAll();
    }
    setTimeout(() => setMsg(""), 2500);
  };
  return (
    <div class="copy">
      <pre ref={ref}>{text}</pre>
      <button class="btn sm" onClick={copy}>
        {msg || "Copy"}
      </button>
    </div>
  );
}

const HOSTS: [Host, string, string][] = [
  ["windows", "Windows PC", "free · PC stays on"],
  ["railway", "Railway", "cloud · ~$5–10/mo"],
  ["render", "Render", "Starter plan + disk"],
  ["vps", "Linux VPS", "~$4–6/mo · one command"],
];

const ZIP = `https://github.com/${REPO}/archive/refs/heads/${BRANCH}.zip`;

export function Deploy() {
  const [host, setHost] = useState<Host>("windows");
  const [token, setToken] = useState(newToken);
  const [paper, setPaper] = useState(10);
  const [tg, setTg] = useState(true);

  const env = useMemo(() => {
    const lines = [
      "# SIGNAL server settings",
      `DASHBOARD_TOKEN=${token}`,
      "# optional: a free key from helius.dev, used to send orders when you go live",
      "# (the trade stream uses the free public Solana feed — streaming through a key is billed per MB)",
      "RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_KEY",
      "RPC_WS_URL=wss://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_KEY",
    ];
    if (tg)
      lines.push(
        "# token from @BotFather; chat id: message your bot, then open api.telegram.org/bot<TOKEN>/getUpdates",
        "TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN",
        "TELEGRAM_CHAT_ID=YOUR_CHAT_ID",
      );
    lines.push(`PAPER_START_SOL=${paper}`, "LEARN_EVERY_HOURS=6");
    return lines.join("\n");
  }, [token, paper, tg]);

  const link = host === "windows" ? `http://localhost:8787/?token=${token}` : `https://YOUR-DOMAIN/?token=${token}`;

  return (
    <div class="grid deploy">
      <div class="card">
        <h2>1 · Where the bot lives</h2>
        <p class="muted" style="margin-top:0">
          The bot needs a machine that is always on. Your phone only opens the dashboard; closing it, or this page, never stops the bot.
        </p>
        <div class="hosts">
          {HOSTS.map(([k, name, sub]) => (
            <button key={k} class="host" aria-pressed={host === k} onClick={() => setHost(k)}>
              <b>{name}</b>
              <span>{sub}</span>
            </button>
          ))}
        </div>
      </div>

      {host === "windows" ? (
        <div class="card">
          <h2>2 · Settings</h2>
          <p class="muted" style="margin:0">
            None to write on a PC. Market data is the free public Solana feed — nothing to set up. The dashboard's <b>More → Setup</b> page links Telegram with a code, and
            later takes a free Helius key and a wallet for going live, with a few taps.
          </p>
        </div>
      ) : (
      <div class="card">
        <h2>2 · Your server settings</h2>
        <p class="muted" style="margin-top:0">
          Generated in this page; nothing is sent anywhere. Replace the <code>YOUR_…</code> parts after pasting. The access token below is your dashboard password — keep it
          private.
        </p>
        <div class="row wrap" style="gap:8px;margin-bottom:10px">
          <button class="btn sm" onClick={() => setToken(newToken())}>
            New access token
          </button>
          <label class="row" style="gap:6px;font-size:13px">
            <input type="checkbox" checked={tg} onChange={(e) => setTg((e.target as HTMLInputElement).checked)} /> Telegram alerts
          </label>
          <label class="row" style="gap:6px;font-size:13px">
            Paper balance
            <input
              class="inp"
              style="max-width:80px"
              type="number"
              inputMode="decimal"
              value={paper}
              onInput={(e) => {
                const v = Number((e.target as HTMLInputElement).value);
                if (Number.isFinite(v) && v > 0) setPaper(Math.min(10_000, v));
              }}
            />
            SOL
          </label>
        </div>
        <CopyBlock text={env} />
      </div>
      )}

      <div class="card">
        <h2>3 · Steps</h2>
        {host === "railway" && (
          <ol class="steps">
            <li>
              <a href="https://railway.com/new" target="_blank" rel="noopener">
                railway.com/new
              </a>{" "}
              → <b>Deploy from GitHub repo</b> → <code>{REPO}</code>.
            </li>
            <li>
              Service → <b>Settings → Source</b>: branch <code>{BRANCH}</code> (or merge it into <code>main</code> first). Railway builds the Dockerfile by itself.
            </li>
            <li>
              <b>Variables → Raw Editor</b>: paste the settings above, fill in your keys, save.
            </li>
            <li>
              Add a <b>Volume</b> to the service with mount path <code>/data</code> — without it, history resets on every deploy.
            </li>
            <li>
              <b>Settings → Networking → Generate Domain</b>, then open:
              <CopyBlock text={link} />
            </li>
          </ol>
        )}
        {host === "render" && (
          <ol class="steps">
            <li>
              <a href="https://dashboard.render.com/blueprints" target="_blank" rel="noopener">
                Render → Blueprints
              </a>{" "}
              → connect <code>{REPO}</code>, branch <code>{BRANCH}</code>. It reads <code>render.yaml</code> (Starter plan, 5 GB disk at /data).
            </li>
            <li>
              In the service's <b>Environment</b>, add the settings above with your keys (use this access token in place of the generated one).
            </li>
            <li>
              Open your <code>onrender.com</code> address with the token:
              <CopyBlock text={link} />
            </li>
            <li>The free plan sleeps when idle and would miss trades — it has to be Starter or higher.</li>
          </ol>
        )}
        {host === "vps" && (
          <ol class="steps">
            <li>Rent an Ubuntu server (1 GB RAM is enough) and log in with SSH.</li>
            <li>
              Run the installer — it installs Node, builds, and sets up a service that restarts itself:
              <CopyBlock text={`curl -fsSL https://raw.githubusercontent.com/${REPO}/${BRANCH}/signal/deploy/install-ubuntu.sh | sudo bash`} />
            </li>
            <li>
              Put the settings above in <code>/opt/signal/signal/.env</code>, then <code>sudo systemctl restart signal</code>.
            </li>
            <li>
              Open <code>http://SERVER-IP:8787/?token=…</code> (or put it behind a domain with HTTPS).
            </li>
          </ol>
        )}
        {host === "windows" && (
          <ol class="steps">
            <li>
              Install{" "}
              <a href="https://nodejs.org" target="_blank" rel="noopener">
                Node.js
              </a>{" "}
              — the big <b>LTS</b> button, then Next until Finish.
            </li>
            <li>
              <a href={ZIP} target="_blank" rel="noopener">
                Download the bot
              </a>{" "}
              → right-click the ZIP → <b>Extract All</b>. Move the <code>signal</code> folder to <code>C:\</code> and rename it <code>SIGNAL</code>.
            </li>
            <li>
              Double-click <code>start-windows.bat</code> (if Windows warns: More info → Run anyway). A black window opens — that is the bot, leave it open. The dashboard
              opens in your browser.
            </li>
            <li>
              Dashboard → <b>More → Setup</b>: link Telegram with the code it shows. Market data needs nothing: it streams from the free public Solana feed.
            </li>
            <li>
              Double-click <code>autostart-windows.bat</code> once so it starts with Windows, and set Windows <b>Settings → System → Power → Sleep</b> to <b>Never</b>.
            </li>
            <li>
              Updates: when a new version is ready the dashboard shows a blue bar — tap <b>Update</b>, or send <code>/update</code> in Telegram. It installs and restarts by
              itself, keeping your keys, settings and history.
            </li>
          </ol>
        )}
        <p class="faint note">
          Then: Bot tab → <b>Strategy</b> → <b>Use this</b> on a rule → switch Auto-trading on (paper). Going live later is Setup → step 5, a few taps.
        </p>
      </div>

      <div class="card warnbox">
        <h2>Going live, later</h2>
        <p style="margin-top:0">
          Only after Learn → go-live check is green, with a <b>new</b> Phantom account used only by the bot. <b>Never paste a private key into this page, a chat or a
          website.</b>
        </p>
        {host === "windows" ? (
          <p style="margin-bottom:0">
            On your PC's own dashboard: <b>More → Setup → 5. Go live</b> → paste the key, set the two limits, type "I understand the risk" → <b>Allow live trading</b>. After
            the restart: <b>Bot → Mode → Live</b>. For safety it only works on the PC itself, not from your phone.
          </p>
        ) : (
          <>
            <p>Add these in your host's variables screen:</p>
            <pre class="mono">
              {`LIVE_TRADING=I_UNDERSTAND_THE_RISK
WALLET_PRIVATE_KEY=…
LIVE_MAX_POSITION_SOL=0.05
LIVE_MAX_DAILY_LOSS_SOL=0.25`}
            </pre>
          </>
        )}
        <p class="faint note" style="margin-bottom:0">
          The limits cannot be raised from the Bot tab. Orders are built by PumpPortal (0.5% fee), signed on your computer, and sent through your RPC.
        </p>
      </div>
    </div>
  );
}
