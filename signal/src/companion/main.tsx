/**
 * SIGNAL demo page: the real dashboard and engine, running on a simulated market inside the
 * page, plus the research behind it and a setup wizard for the 24/7 server.
 */
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { App, Logo } from "../web/app";
import { ext } from "../web/ext";
import { navigate, setTransport } from "../web/store";
import { Deploy } from "./deploy";
import { createLocalEngine } from "./local";
import { Research } from "./research";

const WELCOME_KEY = "signal-demo-welcome-v1";

function seenWelcome() {
  try {
    return localStorage.getItem(WELCOME_KEY) === "1";
  } catch {
    return false;
  }
}

let openWelcome: () => void = () => {};

function Welcome({ close }: { close: () => void }) {
  const go = (sub: string) => {
    close();
    navigate("more", sub);
  };
  return (
    <div class="sheet-bg" onClick={(e) => e.target === e.currentTarget && close()}>
      <div class="sheet welcome" role="dialog" aria-modal="true" aria-label="about this demo">
        <div class="grab" />
        <div class="brand" style="font-size:14px">
          <Logo /> SIGNAL
        </div>
        <h1>The real engine, on a simulated market</h1>
        <p class="muted">
          Everything you see is the same code the server runs — scoring, entries, take-profit and stop-loss, risk limits — fed by a simulated pump.fun market. Coins, prices and
          money here are fake.
        </p>
        <div class="qa">
          <div>
            <b>Does it keep trading when I close the tab?</b>
            <p>The real bot does: it runs on a server 24/7 and messages you on Telegram. This demo only runs while the page is open.</p>
          </div>
          <div>
            <b>Can I trade on the score alone?</b>
            <p>
              Yes. Bot tab → <b>Score only</b> on, pick your number. Any coin that reaches it gets bought; only your budget limits still apply. It's already set to 75 with 2× /
              −50% here.
            </p>
          </div>
          <div>
            <b>Will it actually get in?</b>
            <p>Buys are market orders with 20% room for the price to move, retried for 20 s while the score holds — no perfect-price conditions that never fill.</p>
          </div>
        </div>
        <div class="grid" style="gap:8px;margin-top:14px">
          <button class="btn primary" onClick={close}>
            Explore the demo
          </button>
          <div class="row" style="gap:8px">
            <button class="btn" style="flex:1" onClick={() => go("research")}>
              Is there an edge?
            </button>
            <button class="btn" style="flex:1" onClick={() => go("deploy")}>
              Set up the real bot
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Shell() {
  const [welcome, setWelcome] = useState(!seenWelcome());
  useEffect(() => {
    openWelcome = () => setWelcome(true);
  }, []);
  const close = () => {
    setWelcome(false);
    try {
      localStorage.setItem(WELCOME_KEY, "1");
    } catch {
      /* shown again next visit */
    }
  };
  return (
    <>
      <App />
      {welcome && <Welcome close={close} />}
    </>
  );
}

function Boot({ progress }: { progress: number }) {
  return (
    <div class="boot">
      <div class="brand" style="font-size:15px">
        <Logo /> SIGNAL
      </div>
      <p class="muted">Simulating the last 15 minutes of market so the radar opens full…</p>
      <div class="bar" style="height:6px">
        <i style={`width:${Math.round(progress * 100)}%`} />
      </div>
    </div>
  );
}

ext.demo = true;
ext.moreTabs = [
  { key: "research", label: "Research & odds", render: () => <Research /> },
  { key: "deploy", label: "Set up the real bot", render: () => <Deploy /> },
];
ext.bannerAction = () => (
  <button class="btn sm about" onClick={() => openWelcome()}>
    About
  </button>
);

const root = document.getElementById("root")!;
render(<Boot progress={0} />, root);
const local = createLocalEngine({
  launchesPerMin: 8,
  predictability: 0.35,
  warmMinutes: 15,
  onProgress: (p) => render(<Boot progress={p} />, root),
});
setTransport(local.transport);
void local.ready.then(() => render(<Shell />, root));
