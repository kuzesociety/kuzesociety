/**
 * LIVE executor — real transactions, real money. Off unless the server operator sets
 * LIVE_TRADING=I_UNDERSTAND_THE_RISK and a wallet secret; every order is also capped by
 * LIVE_MAX_POSITION_SOL and a daily loss cap that the dashboard cannot raise.
 *
 * Flow per order: PumpPortal Local API builds the transaction (0.5% fee, pool=auto covers
 * the bonding curve and PumpSwap) → signed HERE with the local key → sent to your RPC and
 * re-broadcast until confirmed or expired → the actual fill (SOL and tokens moved) is read
 * back from the confirmed transaction → reported to the engine.
 */
import type { Engine, Executor, OrderRequest, OrderResult } from "../../core/engine.js";
import type { Logger } from "../../core/util.js";
import { TOKEN_2022_PROGRAM, TOKEN_PROGRAM, buildCloseAccountsTx } from "./rent.js";
import { measureFill, parseWalletSecret, signTransaction, SolanaRpc, type Wallet } from "./solana.js";

export interface LiveOptions {
  walletSecret: string;
  rpcHttp: string;
  maxPositionSol: number;
  maxDailyLossSol: number;
  log: Logger;
  engine: () => Engine;
  /** injectable for tests */
  tradeApi?: string;
  fetchImpl?: typeof fetch;
  onAlert?: (msg: string) => void;
  confirmTimeoutMs?: number;
  pollMs?: number;
}

export class LiveExecutor implements Executor {
  readonly kind = "live" as const;
  wallet: Wallet | null = null;
  rpc: SolanaRpc;
  balanceLamports = -1;
  private errorsInRow = 0;
  private halted = "";
  private inflight = new Set<string>();
  private dayKey = "";
  private dayLoss = 0;
  private timer: NodeJS.Timeout | null = null;
  private rentTimer: NodeJS.Timeout | null = null;
  reclaimed = 0;

  constructor(private o: LiveOptions) {
    this.rpc = new SolanaRpc(o.rpcHttp);
    try {
      this.wallet = parseWalletSecret(o.walletSecret);
      o.log.info("live wallet loaded", { address: this.wallet.address });
    } catch (e) {
      this.halted = `wallet: ${(e as Error).message}`;
      o.log.error("live wallet could not be loaded", { err: (e as Error).message });
    }
  }

  start() {
    const refresh = async () => {
      if (!this.wallet) return;
      try {
        this.balanceLamports = await this.rpc.balance(this.wallet.address);
      } catch (e) {
        this.o.log.warn("wallet balance refresh failed", { err: String(e) });
      }
    };
    void refresh();
    this.timer = setInterval(() => void refresh(), 30_000);
    this.rentTimer = setInterval(() => void this.reclaimRent(), 15 * 60_000);
    this.rentTimer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.rentTimer) clearInterval(this.rentTimer);
  }

  /** Close empty token accounts (not belonging to open positions) to get their rent back. */
  async reclaimRent(): Promise<number> {
    const w = this.wallet;
    if (!w) return 0;
    try {
      const held = new Set([...this.o.engine().positions.values()].map((p) => p.mint));
      const targets: { account: string; program: string }[] = [];
      for (const program of [TOKEN_PROGRAM, TOKEN_2022_PROGRAM]) {
        for (const a of await this.rpc.tokenAccounts(w.address, program)) {
          if (a.amount === 0 && !held.has(a.mint) && !this.inflight.has(`buy:${a.mint}`) && !this.inflight.has(`sell:${a.mint}`)) targets.push({ account: a.pubkey, program });
        }
      }
      if (targets.length === 0) return 0;
      const batch = targets.slice(0, 12);
      const tx = buildCloseAccountsTx(w.address, batch, await this.rpc.latestBlockhash());
      const { signed, signature } = signTransaction(tx, w);
      await this.rpc.sendTransaction(signed);
      this.reclaimed += batch.length;
      this.o.log.info("rent reclaim sent", { accounts: batch.length, approxSol: +(batch.length * 0.00203928).toFixed(5), signature });
      return batch.length;
    } catch (e) {
      this.o.log.warn("rent reclaim failed", { err: String(e) });
      return 0;
    }
  }

  status() {
    return {
      address: this.wallet?.address ?? null,
      balanceSol: this.balanceLamports >= 0 ? this.balanceLamports / 1e9 : null,
      halted: this.halted || null,
      maxPositionSol: this.o.maxPositionSol,
      maxDailyLossSol: this.o.maxDailyLossSol,
      dayLossSol: this.dayLoss / 1e9,
    };
  }

  ready(): boolean {
    return !!this.wallet && !this.halted && this.balanceLamports !== 0;
  }

  maxPositionSol(): number {
    return this.o.maxPositionSol;
  }

  resume() {
    this.halted = "";
    this.errorsInRow = 0;
  }

  /** Called by the engine after each closed live position. */
  notePnl(lamports: number, ts: number) {
    const k = new Date(ts).toISOString().slice(0, 10);
    if (k !== this.dayKey) {
      this.dayKey = k;
      this.dayLoss = 0;
    }
    if (lamports < 0) this.dayLoss += -lamports;
    if (this.o.maxDailyLossSol > 0 && this.dayLoss >= this.o.maxDailyLossSol * 1e9) {
      this.halt(`daily live loss cap reached (${(this.dayLoss / 1e9).toFixed(3)} SOL)`);
    }
  }

  private halt(why: string) {
    if (this.halted) return;
    this.halted = why;
    this.o.log.error(`LIVE TRADING HALTED: ${why}`);
    this.o.onAlert?.(`🛑 LIVE trading halted: ${why}`);
  }

  submit(order: OrderRequest): void {
    void this.execute(order).then(
      (r) => this.o.engine().onOrderResult(r),
      (e) => {
        this.o.log.error("live order crashed", { err: String(e) });
        this.o.engine().onOrderResult({ orderId: order.id, ok: false, error: "live_error", ts: Date.now(), lamports: 0, tokens: 0 });
      },
    );
  }

  private fail(order: OrderRequest, error: string): OrderResult {
    return { orderId: order.id, ok: false, error, ts: Date.now(), lamports: 0, tokens: 0 };
  }

  async execute(order: OrderRequest): Promise<OrderResult> {
    const w = this.wallet;
    if (!w) return this.fail(order, "live_disabled");
    // exits are always allowed (closing risk); new entries respect every gate
    if (order.side === "buy") {
      if (this.halted) return this.fail(order, "live_disabled");
      if (order.amount > this.o.maxPositionSol * 1e9 + 1) return this.fail(order, "live_error");
      if (this.balanceLamports >= 0 && this.balanceLamports < order.amount + 0.01e9) return this.fail(order, "insufficient_balance");
    }
    const key = `${order.side}:${order.mint}`;
    if (this.inflight.has(key)) return this.fail(order, "pending");
    this.inflight.add(key);
    try {
      const engine = this.o.engine();
      const body = {
        publicKey: w.address,
        action: order.side,
        mint: order.mint,
        amount: order.side === "buy" ? +(order.amount / 1e9).toFixed(9) : order.closesAccount ? "100%" : Math.floor(order.amount) / 1e6,
        denominatedInSol: order.side === "buy" ? "true" : "false",
        slippage: Math.round(order.slippagePct),
        priorityFee: engine.settings.priorityFeeSol,
        pool: "auto",
      };
      const f = this.o.fetchImpl ?? fetch;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10_000);
      let txBytes: Uint8Array;
      try {
        const res = await f(this.o.tradeApi ?? "https://pumpportal.fun/api/trade-local", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        if (res.status !== 200) {
          const text = (await res.text()).slice(0, 200);
          this.o.log.warn("trade API refused order", { status: res.status, text });
          return this.noteError(order, "live_error");
        }
        txBytes = new Uint8Array(await res.arrayBuffer());
      } finally {
        clearTimeout(t);
      }
      const { signed, signature } = signTransaction(txBytes, w);
      const started = Date.now();
      const deadline = started + (this.o.confirmTimeoutMs ?? 75_000);
      const poll = this.o.pollMs ?? 1_000;
      let lastSend = 0;
      let status: { confirmed: boolean; err: unknown } | null = null;
      while (Date.now() < deadline) {
        if (Date.now() - lastSend >= 2_000) {
          lastSend = Date.now();
          try {
            await this.rpc.sendTransaction(signed);
          } catch (e) {
            this.o.log.debug("send retry", { err: String(e) });
          }
        }
        await new Promise((r) => setTimeout(r, poll));
        try {
          status = await this.rpc.signatureStatus(signature);
        } catch {
          status = null;
        }
        if (status && (status.confirmed || status.err)) break;
      }
      if (!status || (!status.confirmed && !status.err)) {
        // one last look with full history before declaring the order lost
        await new Promise((r) => setTimeout(r, Math.min(20_000, (this.o.confirmTimeoutMs ?? 75_000) / 4)));
        status = await this.rpc.call<{ value: ({ confirmationStatus?: string; err?: unknown } | null)[] }>("getSignatureStatuses", [[signature], { searchTransactionHistory: true }])
          .then((r) => (r?.value?.[0] ? { confirmed: ["confirmed", "finalized"].includes(r.value[0].confirmationStatus ?? ""), err: r.value[0].err ?? null } : null))
          .catch(() => null);
        if (!status || (!status.confirmed && !status.err)) return this.noteError(order, order.side === "buy" ? "live_timeout" : "live_error");
      }
      if (status.err) {
        const errText = JSON.stringify(status.err);
        const slip = /6002|6003|6004|TooMuch|TooLittle|Slippage|0x1772|0x1773/i.test(errText);
        this.o.log.warn("live transaction failed on-chain", { signature, err: errText });
        return this.noteError(order, slip ? "slippage" : "live_error", slip);
      }
      const tx = await this.rpc.getTransaction(signature).catch(() => null);
      const fill = tx ? measureFill(tx, w.address, order.mint) : null;
      this.errorsInRow = 0;
      const tok = engine.tokens.get(order.mint);
      if (!fill) {
        // confirmed but unreadable: use the order's intent so accounting stays consistent
        this.o.log.warn("fill could not be measured, using order values", { signature });
        return { orderId: order.id, ok: true, ts: Date.now(), lamports: order.side === "buy" ? order.amount : 0, tokens: order.side === "buy" ? 0 : order.amount, mcapSol: tok?.mcapSol, sig: signature };
      }
      if (order.side === "buy") {
        return { orderId: order.id, ok: true, ts: Date.now(), lamports: Math.max(0, -fill.solDelta), tokens: Math.max(0, fill.tokenDelta), mcapSol: tok?.mcapSol, sig: signature };
      }
      return { orderId: order.id, ok: true, ts: Date.now(), lamports: Math.max(0, fill.solDelta), tokens: Math.max(0, -fill.tokenDelta), mcapSol: tok?.mcapSol, sig: signature };
    } catch (e) {
      this.o.log.error("live execution error", { err: String((e as Error).message ?? e) });
      return this.noteError(order, "live_error");
    } finally {
      this.inflight.delete(key);
    }
  }

  private noteError(order: OrderRequest, error: string, expected = false): OrderResult {
    if (!expected) {
      this.errorsInRow++;
      if (this.errorsInRow >= 4) this.halt(`${this.errorsInRow} live errors in a row (last: ${error})`);
    }
    return this.fail(order, error);
  }
}
