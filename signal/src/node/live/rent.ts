/**
 * Rent reclaim: every coin bought creates a token account holding ~0.00204 SOL of rent.
 * After a full exit the account is empty; closing it returns the rent to the wallet —
 * about 2% of a 0.1 SOL trade. This builds a legacy transaction of SPL-Token
 * `CloseAccount` instructions (works for Token and Token-2022 accounts) without any SDK.
 */
import { base58Decode } from "../../core/codec.js";

export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const CLOSE_ACCOUNT = 9;

function compactU16(n: number): number[] {
  const out: number[] = [];
  let v = n;
  for (;;) {
    let b = v & 0x7f;
    v >>= 7;
    if (v) b |= 0x80;
    out.push(b);
    if (!v) break;
  }
  return out;
}

export interface CloseTarget {
  account: string;
  program: string;
}

/**
 * Unsigned legacy transaction closing `targets` (rent → owner). Returns the full
 * wire bytes with a zeroed signature slot for `owner` (sign with signTransaction).
 */
export function buildCloseAccountsTx(owner: string, targets: CloseTarget[], recentBlockhash: string): Uint8Array {
  if (targets.length === 0) throw new Error("nothing to close");
  if (targets.length > 20) throw new Error("too many accounts for one transaction");
  const programs = [...new Set(targets.map((t) => t.program))];
  // account order: signer+writable (owner), writable non-signers (token accounts), readonly non-signers (programs)
  const keys = [owner, ...targets.map((t) => t.account), ...programs];
  const index = (k: string) => keys.indexOf(k);
  const bytes: number[] = [];
  bytes.push(1, 0, programs.length); // header
  bytes.push(...compactU16(keys.length));
  for (const k of keys) {
    const b = base58Decode(k);
    if (b.length !== 32) throw new Error(`bad pubkey ${k}`);
    bytes.push(...b);
  }
  const bh = base58Decode(recentBlockhash);
  if (bh.length !== 32) throw new Error("bad blockhash");
  bytes.push(...bh);
  bytes.push(...compactU16(targets.length));
  for (const t of targets) {
    bytes.push(index(t.program));
    bytes.push(...compactU16(3), index(t.account), index(owner), index(owner));
    bytes.push(...compactU16(1), CLOSE_ACCOUNT);
  }
  const message = Uint8Array.from(bytes);
  const tx = new Uint8Array(1 + 64 + message.length);
  tx[0] = 1;
  tx.set(message, 65);
  return tx;
}
