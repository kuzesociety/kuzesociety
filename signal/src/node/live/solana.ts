/**
 * Minimal, dependency-free Solana plumbing for live trading:
 *  - load a wallet secret (Phantom base58 export, Solana CLI JSON array, or 32-byte seed)
 *  - Ed25519 signing via node:crypto
 *  - sign a serialized (legacy or v0) transaction returned by an execution API
 *  - a small JSON-RPC client (send, confirm, read balances)
 *
 * The private key never leaves this process and is never logged.
 */
import { createPrivateKey, createPublicKey, sign as edSign, verify as edVerify, type KeyObject } from "node:crypto";
import { base58Decode, base58Encode, base64Encode } from "../../core/codec.js";
import { postJson } from "../http.js";

const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export interface Wallet {
  address: string;
  publicKey: Uint8Array;
  sign(message: Uint8Array): Uint8Array;
}

export function walletFromSeed(seed: Uint8Array): Wallet {
  if (seed.length !== 32) throw new Error("seed must be 32 bytes");
  const key: KeyObject = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, Buffer.from(seed)]), format: "der", type: "pkcs8" });
  const spki = createPublicKey(key).export({ format: "der", type: "spki" }) as Buffer;
  const publicKey = new Uint8Array(spki.subarray(spki.length - 32));
  return {
    address: base58Encode(publicKey),
    publicKey,
    sign: (m) => new Uint8Array(edSign(null, Buffer.from(m), key)),
  };
}

/**
 * Parse a wallet secret. Accepts: base58 64-byte secret (Phantom "export private key"),
 * a JSON byte array (Solana CLI keypair file), or a base58 32-byte seed.
 */
export function parseWalletSecret(secret: string): Wallet {
  const s = secret.trim();
  let bytes: Uint8Array;
  if (s.startsWith("[")) {
    const arr = JSON.parse(s);
    if (!Array.isArray(arr) || !arr.every((x) => Number.isInteger(x) && x >= 0 && x < 256)) throw new Error("wallet JSON must be a byte array");
    bytes = Uint8Array.from(arr);
  } else bytes = base58Decode(s);
  if (bytes.length === 64) {
    const w = walletFromSeed(bytes.subarray(0, 32));
    if (base58Encode(bytes.subarray(32)) !== w.address) throw new Error("wallet secret is corrupted: public key does not match");
    return w;
  }
  if (bytes.length === 32) return walletFromSeed(bytes);
  throw new Error(`wallet secret must be 64 or 32 bytes (got ${bytes.length})`);
}

export function verifySignature(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean {
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(publicKey)]);
  const pub = createPublicKey({ key: spki, format: "der", type: "spki" });
  return edVerify(null, Buffer.from(message), pub, Buffer.from(signature));
}

// ---- transaction wire format ----------------------------------------------------------

function readCompactU16(b: Uint8Array, off: number): { value: number; size: number } {
  let value = 0;
  let size = 0;
  for (;;) {
    if (off + size >= b.length) throw new Error("truncated compact-u16");
    const byte = b[off + size]!;
    value |= (byte & 0x7f) << (7 * size);
    size++;
    if ((byte & 0x80) === 0) break;
    if (size > 3) throw new Error("bad compact-u16");
  }
  return { value, size };
}

export interface ParsedTx {
  numSignatures: number;
  sigOffset: number;
  messageOffset: number;
  version: "legacy" | number;
  numRequiredSignatures: number;
  accountKeys: string[];
}

export function parseTransaction(tx: Uint8Array): ParsedTx {
  const sigs = readCompactU16(tx, 0);
  const sigOffset = sigs.size;
  const messageOffset = sigOffset + sigs.value * 64;
  if (messageOffset >= tx.length) throw new Error("transaction too short");
  let p = messageOffset;
  let version: "legacy" | number = "legacy";
  if (tx[p]! & 0x80) {
    version = tx[p]! & 0x7f;
    p++;
  }
  const numRequiredSignatures = tx[p]!;
  p += 3; // header: required sigs, readonly signed, readonly unsigned
  const keys = readCompactU16(tx, p);
  p += keys.size;
  const accountKeys: string[] = [];
  for (let i = 0; i < keys.value; i++) {
    if (p + 32 > tx.length) throw new Error("truncated account keys");
    accountKeys.push(base58Encode(tx.subarray(p, p + 32)));
    p += 32;
  }
  if (sigs.value !== numRequiredSignatures) throw new Error("signature count does not match message header");
  return { numSignatures: sigs.value, sigOffset, messageOffset, version, numRequiredSignatures, accountKeys };
}

/** Sign a serialized transaction in place of `wallet`'s signature slot. */
export function signTransaction(tx: Uint8Array, wallet: Wallet): { signed: Uint8Array; signature: string } {
  const parsed = parseTransaction(tx);
  const idx = parsed.accountKeys.slice(0, parsed.numRequiredSignatures).indexOf(wallet.address);
  if (idx < 0) throw new Error("transaction does not require this wallet's signature");
  const message = tx.subarray(parsed.messageOffset);
  const sig = wallet.sign(message);
  const out = new Uint8Array(tx);
  out.set(sig, parsed.sigOffset + idx * 64);
  return { signed: out, signature: base58Encode(out.subarray(parsed.sigOffset, parsed.sigOffset + 64)) };
}

// ---- JSON-RPC ----------------------------------------------------------------------------

export class SolanaRpc {
  constructor(private url: string) {}

  async call<T>(method: string, params: unknown[], timeoutMs = 10_000): Promise<T> {
    const res = await postJson<{ result?: T; error?: { message?: string; code?: number } }>(this.url, { jsonrpc: "2.0", id: Date.now(), method, params }, { timeoutMs });
    if (!res.json) throw new Error(`${method}: HTTP ${res.status} ${res.text.slice(0, 120)}`);
    if (res.json.error) throw new Error(`${method}: ${res.json.error.message ?? res.json.error.code}`);
    return res.json.result as T;
  }

  sendTransaction(signed: Uint8Array): Promise<string> {
    return this.call<string>("sendTransaction", [base64Encode(signed), { encoding: "base64", skipPreflight: true, maxRetries: 0 }]);
  }

  async signatureStatus(sig: string): Promise<{ confirmed: boolean; err: unknown } | null> {
    const r = await this.call<{ value: ({ confirmationStatus?: string; err?: unknown } | null)[] }>("getSignatureStatuses", [[sig], { searchTransactionHistory: false }]);
    const v = r?.value?.[0];
    if (!v) return null;
    return { confirmed: v.confirmationStatus === "confirmed" || v.confirmationStatus === "finalized", err: v.err ?? null };
  }

  getTransaction(sig: string): Promise<TxMeta | null> {
    return this.call<TxMeta | null>("getTransaction", [sig, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }], 15_000);
  }

  async balance(address: string): Promise<number> {
    const r = await this.call<{ value: number }>("getBalance", [address, { commitment: "confirmed" }]);
    return r.value;
  }

  async tokenBalance(owner: string, mint: string): Promise<number> {
    const r = await this.call<{ value: { account: { data: { parsed: { info: { tokenAmount: { amount: string } } } } } }[] }>("getTokenAccountsByOwner", [
      owner,
      { mint },
      { encoding: "jsonParsed", commitment: "confirmed" },
    ]);
    let total = 0;
    for (const a of r.value ?? []) total += Number(a.account.data.parsed.info.tokenAmount.amount);
    return total;
  }
}

export interface TxMeta {
  meta: {
    err: unknown;
    fee: number;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances?: { owner?: string; mint: string; uiTokenAmount: { amount: string } }[];
    postTokenBalances?: { owner?: string; mint: string; uiTokenAmount: { amount: string } }[];
    logMessages?: string[];
  } | null;
  transaction: { message: { accountKeys: ({ pubkey: string } | string)[] } };
}

/** SOL spent/received and tokens moved for `owner` in a confirmed transaction. */
export function measureFill(tx: TxMeta, owner: string, mint: string): { solDelta: number; tokenDelta: number } | null {
  if (!tx.meta) return null;
  const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === "string" ? k : k.pubkey));
  const i = keys.indexOf(owner);
  if (i < 0) return null;
  const solDelta = (tx.meta.postBalances[i] ?? 0) - (tx.meta.preBalances[i] ?? 0);
  type Row = { owner?: string; mint: string; uiTokenAmount: { amount: string } };
  const sum = (rows: Row[] | undefined) => (rows ?? []).filter((r) => r.owner === owner && r.mint === mint).reduce((s, r) => s + Number(r.uiTokenAmount.amount), 0);
  const tokenDelta = sum(tx.meta.postTokenBalances) - sum(tx.meta.preTokenBalances);
  return { solDelta, tokenDelta };
}
