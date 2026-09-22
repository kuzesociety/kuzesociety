import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Keypair, MessageV0, PublicKey, SystemProgram, Transaction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { base58Decode, base58Encode, base64Decode } from "../src/core/codec.js";
import { Engine } from "../src/core/engine.js";
import { silentLogger } from "../src/core/util.js";
import { LiveExecutor } from "../src/node/live/executor.js";
import { measureFill, parseTransaction, parseWalletSecret, signTransaction, verifySignature } from "../src/node/live/solana.js";

const BLOCKHASH = base58Encode(new Uint8Array(32).fill(7));

function unsignedV0(payer: PublicKey): Uint8Array {
  const msg = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: BLOCKHASH,
    instructions: [SystemProgram.transfer({ fromPubkey: payer, toPubkey: Keypair.generate().publicKey, lamports: 12345 })],
  }).compileToV0Message();
  return new VersionedTransaction(msg).serialize();
}

describe("wallet + signing (cross-checked against @solana/web3.js)", () => {
  it("loads Phantom base58 exports, CLI JSON arrays and rejects corrupted secrets", () => {
    const kp = Keypair.generate();
    const w = parseWalletSecret(base58Encode(kp.secretKey));
    expect(w.address).toBe(kp.publicKey.toBase58());
    expect(parseWalletSecret(JSON.stringify(Array.from(kp.secretKey))).address).toBe(kp.publicKey.toBase58());
    expect(parseWalletSecret(base58Encode(kp.secretKey.subarray(0, 32))).address).toBe(kp.publicKey.toBase58());
    const bad = new Uint8Array(kp.secretKey);
    bad[40] ^= 1;
    expect(() => parseWalletSecret(base58Encode(bad))).toThrow(/corrupted/);
    expect(() => parseWalletSecret("abc")).toThrow();
  });

  it("produces the exact same signature as web3.js for v0 and legacy transactions", () => {
    const kp = Keypair.generate();
    const w = parseWalletSecret(base58Encode(kp.secretKey));
    // v0
    const raw = unsignedV0(kp.publicKey);
    const mine = signTransaction(raw, w);
    const theirs = VersionedTransaction.deserialize(raw);
    theirs.sign([kp]);
    expect(Buffer.from(mine.signed).equals(Buffer.from(theirs.serialize()))).toBe(true);
    expect(mine.signature).toBe(base58Encode(theirs.signatures[0]!));
    // legacy
    const legacy = new Transaction({ feePayer: kp.publicKey, recentBlockhash: BLOCKHASH }).add(
      SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1 }),
    );
    const rawLegacy = legacy.serialize({ requireAllSignatures: false, verifySignatures: false });
    const mineLegacy = signTransaction(new Uint8Array(rawLegacy), w);
    legacy.sign(kp);
    expect(Buffer.from(mineLegacy.signed).equals(legacy.serialize())).toBe(true);
    const parsed = parseTransaction(mine.signed);
    expect(parsed.version).toBe(0);
    expect(verifySignature(w.publicKey, mine.signed.subarray(parsed.messageOffset), base58Decode(mine.signature))).toBe(true);
  });

  it("refuses to sign a transaction that is not for this wallet", () => {
    const kp = Keypair.generate();
    const other = parseWalletSecret(base58Encode(Keypair.generate().secretKey));
    expect(() => signTransaction(unsignedV0(kp.publicKey), other)).toThrow(/does not require/);
  });

  it("measures the real fill from a confirmed transaction", () => {
    const owner = Keypair.generate().publicKey.toBase58();
    const mint = Keypair.generate().publicKey.toBase58();
    const fill = measureFill(
      {
        meta: {
          err: null,
          fee: 5000,
          preBalances: [2_000_000_000, 1],
          postBalances: [1_898_000_000, 1],
          preTokenBalances: [],
          postTokenBalances: [{ owner, mint, uiTokenAmount: { amount: "3500000000000" } }],
        },
        transaction: { message: { accountKeys: [{ pubkey: owner }, { pubkey: mint }] } },
      },
      owner,
      mint,
    );
    expect(fill).toEqual({ solDelta: -102_000_000, tokenDelta: 3_500_000_000_000 });
  });
});

describe("live executor (mock trade API + mock RPC)", () => {
  let server: Server;
  let url = "";
  const kp = Keypair.generate();
  const mint = Keypair.generate().publicKey.toBase58();
  const sent: Uint8Array[] = [];
  let txErr: unknown = null;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const r = JSON.parse(body);
        const reply = (result: unknown) => res.end(JSON.stringify({ jsonrpc: "2.0", id: r.id, result }));
        switch (r.method) {
          case "sendTransaction": {
            const bytes = base64Decode(r.params[0]);
            sent.push(bytes);
            const p = parseTransaction(bytes);
            return reply(base58Encode(bytes.subarray(p.sigOffset, p.sigOffset + 64)));
          }
          case "getSignatureStatuses":
            return reply({ value: [{ confirmationStatus: "confirmed", err: txErr }] });
          case "getTransaction":
            return reply({
              meta: {
                err: null,
                fee: 5000,
                preBalances: [1_000_000_000],
                postBalances: [899_000_000],
                preTokenBalances: [],
                postTokenBalances: [{ owner: kp.publicKey.toBase58(), mint, uiTokenAmount: { amount: "4200000000000" } }],
              },
              transaction: { message: { accountKeys: [{ pubkey: kp.publicKey.toBase58() }] } },
            });
          case "getBalance":
            return reply({ value: 1_000_000_000 });
          default:
            return reply(null);
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());

  function executor() {
    const engine = new Engine({ now: Date.now() });
    const fetchImpl = (async (_u: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.publicKey).toBe(kp.publicKey.toBase58());
      expect(body.pool).toBe("auto");
      return new Response(Buffer.from(unsignedV0(kp.publicKey)), { status: 200 });
    }) as typeof fetch;
    const ex = new LiveExecutor({
      walletSecret: base58Encode(kp.secretKey),
      rpcHttp: url,
      maxPositionSol: 0.2,
      maxDailyLossSol: 1,
      log: silentLogger,
      engine: () => engine,
      fetchImpl,
      tradeApi: "http://trade.test/api/trade-local",
      confirmTimeoutMs: 5_000,
      pollMs: 20,
    });
    ex.balanceLamports = 1e9;
    return ex;
  }

  const order = (side: "buy" | "sell", amount: number) => ({
    id: "o1",
    side,
    mint,
    positionId: "p1",
    amount,
    slippagePct: 20,
    expectedPrice: 0,
    reason: "test",
    submittedAt: Date.now(),
    attempt: 1,
  });

  it("builds, signs, sends, confirms and measures a buy", async () => {
    txErr = null;
    const ex = executor();
    const r = await ex.execute(order("buy", 0.1e9));
    expect(r.ok).toBe(true);
    expect(r.lamports).toBe(101_000_000);
    expect(r.tokens).toBe(4_200_000_000_000);
    const last = sent[sent.length - 1]!;
    const p = parseTransaction(last);
    expect(verifySignature(kp.publicKey.toBytes(), last.subarray(p.messageOffset), last.subarray(p.sigOffset, p.sigOffset + 64))).toBe(true);
  });

  it("enforces the server cap and reports on-chain slippage failures", async () => {
    txErr = null;
    const ex = executor();
    expect((await ex.execute(order("buy", 0.5e9))).ok).toBe(false); // above LIVE_MAX_POSITION_SOL
    txErr = { InstructionError: [2, { Custom: 6002 }] };
    const r = await ex.execute(order("buy", 0.1e9));
    expect(r.ok).toBe(false);
    expect(r.error).toBe("slippage");
  });

  it("halts entries after repeated errors but still lets positions be sold", async () => {
    txErr = { InstructionError: [0, "InvalidAccountData"] };
    const ex = executor();
    for (let i = 0; i < 4; i++) await ex.execute(order("buy", 0.1e9));
    expect(ex.ready()).toBe(false);
    expect(ex.status().halted).toMatch(/errors in a row/);
    txErr = null;
    const sell = await ex.execute(order("sell", 4_200_000_000_000));
    expect(sell.error).not.toBe("live_disabled");
  });
});

describe("rent reclaim transaction", () => {
  it("builds the same CloseAccount transaction as web3.js (Token + Token-2022)", async () => {
    const { TransactionInstruction } = await import("@solana/web3.js");
    const { buildCloseAccountsTx, TOKEN_PROGRAM, TOKEN_2022_PROGRAM } = await import("../src/node/live/rent.js");
    const kp = Keypair.generate();
    const owner = kp.publicKey;
    const targets = [
      { account: Keypair.generate().publicKey.toBase58(), program: TOKEN_PROGRAM },
      { account: Keypair.generate().publicKey.toBase58(), program: TOKEN_2022_PROGRAM },
      { account: Keypair.generate().publicKey.toBase58(), program: TOKEN_PROGRAM },
    ];
    const mine = buildCloseAccountsTx(owner.toBase58(), targets, BLOCKHASH);
    const tx = new Transaction({ feePayer: owner, recentBlockhash: BLOCKHASH });
    for (const t of targets) {
      tx.add(
        new TransactionInstruction({
          programId: new PublicKey(t.program),
          keys: [
            { pubkey: new PublicKey(t.account), isSigner: false, isWritable: true },
            { pubkey: owner, isSigner: false, isWritable: true },
            { pubkey: owner, isSigner: true, isWritable: false },
          ],
          data: Buffer.from([9]),
        }),
      );
    }
    const theirs = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    // same meaning (web3.js orders keys alphabetically inside each group; both are valid)
    const decode = (bytes: Uint8Array) => {
      const m = Transaction.from(Buffer.from(bytes)).compileMessage();
      const header = m.header;
      const keys = m.accountKeys.map((k) => k.toBase58());
      return {
        header,
        signers: keys.slice(0, header.numRequiredSignatures),
        blockhash: m.recentBlockhash,
        ixs: m.instructions.map((ix) => ({ program: keys[ix.programIdIndex], accounts: ix.accounts.map((a) => keys[a]), data: ix.data })),
      };
    };
    expect(decode(mine)).toEqual(decode(new Uint8Array(theirs)));
    const w = parseWalletSecret(base58Encode(kp.secretKey));
    const signed = signTransaction(mine, w);
    const p = parseTransaction(signed.signed);
    expect(verifySignature(w.publicKey, signed.signed.subarray(p.messageOffset), signed.signed.subarray(p.sigOffset, p.sigOffset + 64))).toBe(true);
    expect(Transaction.from(Buffer.from(signed.signed)).verifySignatures()).toBe(true);
  });
});
