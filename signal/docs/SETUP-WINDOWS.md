# Set up SIGNAL on your Windows PC (paper trading, free)

About 15 minutes. You need: a Windows 10/11 PC that stays on, an internet connection, and (optional) Telegram on your phone. Nothing here costs money. Paper trading uses fake money on the real market.

## 1. Install Node.js (once)

1. Open **https://nodejs.org** and click the big **LTS** download button.
2. Open the downloaded file and click **Next** until **Finish**. Leave every option as it is.

## 2. Download SIGNAL

1. Click this link — the download starts by itself:
   **https://github.com/kuzesociety/kuzesociety/archive/refs/heads/claude/signal-meme-trading-bot-o142hw.zip**
2. Right-click the downloaded ZIP → **Properties** → tick **Unblock** (if you see it) → **OK**.
3. Right-click the ZIP → **Extract All…** → **Extract**.
4. Open the extracted folder. Move the folder called **signal** to `C:\` and rename it **SIGNAL**, so you end up with `C:\SIGNAL`. (Avoid Desktop/Documents if OneDrive syncs them.)

## 3. Start it

1. Open `C:\SIGNAL` and double-click **start-windows.bat**.
   - If a blue **"Windows protected your PC"** box appears: **More info → Run anyway**.
   - If Windows asks whether Node.js may use the network: tick **Private networks** → **Allow** (needed for your phone).
2. A black window opens and stays open — **that is the bot. Leave it open.** Your browser opens the dashboard by itself (or go to **http://localhost:8787**).

## 4. Market data (nothing to do)

Every pump.fun trade comes from the **free public Solana feed** — no key, no account, no cost. **More → Health** shows *solana-rpc* green with the message count going up, and **More → Setup → 1** shows how much internet it uses per day.

**Helius key: optional.** You only need one to send orders when you go live (step 9). A free key is enough:

1. Go to **https://dashboard.helius.dev** and sign up (Google login works). The free plan is chosen by default.
2. Open **API Keys** and copy your key (it looks like `1a2b3c4d-5e6f-…`).
3. Dashboard: **More → Setup → 1. Market data → Your RPC key** → paste → **Save key**. The bot tests it and restarts by itself.

The trade stream stays on the free feed even with a key saved. Streaming every trade through a key is billed per MB and used up a free Helius plan in about five hours. If the free feed ever keeps dropping, Setup lets you stream through your key with a daily cap (after the cap, it switches back to the free feed until 00:00 UTC).

## 5. Telegram alerts (optional, recommended)

1. In Telegram, open **@BotFather** → send `/newbot` → pick any name → pick a username ending in `bot`.
2. Copy the token BotFather sends (looks like `123456789:AAH…`).
3. Dashboard: **More → Setup → 2. Telegram** → paste → **Connect**. A 6-digit code appears.
4. Open your new bot in Telegram and send it that code. The Setup step turns green and the bot says **Linked**.

From then on you get a message for every buy and sell, and you can control the bot from anywhere: `/status` `/pause` `/resume` `/score 75` `/tp 100` `/sl 50` `/hold 10` `/kill` `/update`.

## 6. Start paper trading

1. Dashboard → **Bot** tab → **Strategy** → **Use this** on the rule you want:
   - **Your plan** — buy at score 75, sell at 2× or −50%.
   - **Simulator finding: fast momentum** — buy at 95, sell at +500% or −20%, or after 10 minutes. Unproven on the real market; paper-testing it is exactly how you find out.
   - **Found in your data** — appears after a day or more, when the edge finder proves a rule on data it never saw.
2. Switch **Auto-trading** on at the top of the Bot tab. It trades with fake money (10 SOL to start).
3. Leave it running for days. Check **Learn** (go-live check, edge finder) and **Trades**.

## 7. Keep it running 24/7

- **No sleep:** Windows **Settings → System → Power** (Windows 10: *Power & sleep*) → *When plugged in, put my device to sleep after* → **Never**. The screen may turn off; the PC must not sleep. If it does, Telegram tells you how long the bot was asleep.
- **Start with Windows:** double-click **autostart-windows.bat** once. After a restart (for example Windows Update), sign in and the bot starts by itself. Run it again to undo.
- **Your phone at home:** **More → Setup → 4** shows a link for your phone (same Wi-Fi). Away from home, use Telegram.
- **Stop:** close the black window. **Start:** double-click `start-windows.bat` again. Everything is saved in `C:\SIGNAL\data`.

## 8. Updates (one tap)

The bot checks for a new version every few hours. When one is ready:

1. The dashboard shows a blue bar **"A new version of SIGNAL is ready"** (and Telegram tells you).
2. Tap **Update** → **Update now**. The bot downloads it, restarts by itself in about a minute, and keeps your keys, settings, history and open trades.

From your phone anywhere: send `/update` to your Telegram bot. You can see your version and check by hand in **More → Setup**.

**Installed before the Update button existed?** Update by hand once:

1. Close the black SIGNAL window.
2. Download the ZIP again (same link as step 2) → right-click → **Extract All…** → **Extract**.
3. Open the extracted folder, then the **signal** folder inside it. Press **Ctrl+A** (select all), then **Ctrl+C** (copy).
4. Open `C:\SIGNAL`, press **Ctrl+V** (paste) → **Replace the files in the destination**. Your `data` folder (keys, settings, history) is not in the download, so it stays as it is.
5. Double-click **start-windows.bat**.

## 9. Going live later (a few clicks, when the evidence says so)

Only when **Learn → go-live check** is green for your strategy:

1. Save your free Helius key if you have not yet (step 4): orders are sent through it.
2. In **Phantom**: add a **new account** used only by the bot, and send it only what you can afford to lose.
3. Phantom → **Settings → Manage accounts →** that account → **Show private key** → copy.
4. On the PC running the bot (for safety this does not work from your phone): **More → Setup → 5. Go live** → paste the key → set **Max SOL per trade** (e.g. 0.05) and **Stop for the day after losing** (e.g. 0.25) → type `I understand the risk` → **Allow live trading**. The bot restarts.
5. **Bot → Mode → Live.** Done. To go back: **Mode → Paper**, or **Setup → Turn live off**.

The key is saved only in `C:\SIGNAL\data\config.json` on your PC and is never shown again. The two limits cannot be raised from the Bot tab.

## If something is wrong

- **The black window closes immediately:** Node.js is not installed — do step 1, then start again.
- **Settings you changed are back to the old values:** on the **Bot** tab, changes apply only after **Save** — the bar at the bottom says so until you press it. Strategies (**Use this**) and Telegram commands apply at once.
- **"SIGNAL is already running in another window":** the bot started with Windows is already on (maybe minimized on the taskbar). Only one runs at a time; close the extra window.
- **Red bar "Live data feed is down":** the bar says why. *Refused the key* (only when streaming through your key) → paste your Helius key again in **More → Setup**. *Limiting requests* on the free feed → it retries by itself; if it keeps happening, Setup lets you stream through your own key with a daily cap. Anything else is usually the internet connection: the bot reconnects by itself. Right after starting, "Connecting to the live market data…" for a few seconds is normal.
- **No trades after hours:** Bot tab → *Why no trades?* lists exactly what blocked each signal.
- **Dashboard won't open:** make sure the black window is open, then go to http://localhost:8787.
