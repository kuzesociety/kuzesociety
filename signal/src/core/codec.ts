/**
 * Small, dependency-free binary helpers: base58, base64 and a lenient Borsh reader.
 * Isomorphic (Node + browser).
 */

const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const B58_MAP = (() => {
  const m = new Int16Array(128).fill(-1);
  for (let i = 0; i < B58_ALPHABET.length; i++) m[B58_ALPHABET.charCodeAt(i)] = i;
  return m;
})();

export function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  // log(256)/log(58) ≈ 1.366
  const size = Math.ceil(((bytes.length - zeros) * 138) / 100) + 1;
  const buf = new Uint8Array(size);
  let length = 0;
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i]!;
    let j = 0;
    for (let k = size - 1; (carry !== 0 || j < length) && k >= 0; k--, j++) {
      carry += 256 * buf[k]!;
      buf[k] = carry % 58;
      carry = (carry / 58) | 0;
    }
    length = j;
  }
  let it = size - length;
  while (it < size && buf[it] === 0) it++;
  let out = "1".repeat(zeros);
  for (; it < size; it++) out += B58_ALPHABET[buf[it]!];
  return out;
}

export function base58Decode(str: string): Uint8Array {
  if (str.length === 0) return new Uint8Array(0);
  let zeros = 0;
  while (zeros < str.length && str[zeros] === "1") zeros++;
  const size = Math.ceil(((str.length - zeros) * 733) / 1000) + 1; // log(58)/log(256)
  const buf = new Uint8Array(size);
  let length = 0;
  for (let i = zeros; i < str.length; i++) {
    const c = str.charCodeAt(i);
    const v = c < 128 ? B58_MAP[c]! : -1;
    if (v < 0) throw new Error(`invalid base58 character at ${i}`);
    let carry = v;
    let j = 0;
    for (let k = size - 1; (carry !== 0 || j < length) && k >= 0; k--, j++) {
      carry += 58 * buf[k]!;
      buf[k] = carry & 0xff;
      carry >>= 8;
    }
    length = j;
  }
  let it = size - length;
  while (it < size && buf[it] === 0) it++;
  const out = new Uint8Array(zeros + (size - it));
  out.set(buf.subarray(it), zeros);
  return out;
}

/** True when `s` looks like a base58 Solana address (32-byte pubkey). */
export function isAddress(s: unknown): s is string {
  if (typeof s !== "string" || s.length < 32 || s.length > 44) return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 128 || B58_MAP[c]! < 0) return false;
  }
  try {
    return base58Decode(s).length === 32;
  } catch {
    return false;
  }
}

declare const Buffer: { from(s: string, enc: string): Uint8Array } | undefined;

export function base64Decode(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function base64Encode(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return (Buffer as unknown as { from(b: Uint8Array): { toString(enc: string): string } }).from(bytes).toString("base64");
  }
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

const utf8 = new TextDecoder("utf-8", { fatal: false });

export class OutOfData extends Error {
  constructor() {
    super("out of data");
  }
}

/** Lenient little-endian Borsh reader. Throws `OutOfData` past the end. */
export class Reader {
  private view: DataView;
  pos: number;
  constructor(private bytes: Uint8Array, start = 0) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.pos = start;
  }
  get remaining(): number {
    return this.bytes.length - this.pos;
  }
  private need(n: number) {
    if (this.pos + n > this.bytes.length) throw new OutOfData();
  }
  u8(): number {
    this.need(1);
    return this.view.getUint8(this.pos++);
  }
  bool(): boolean {
    return this.u8() !== 0;
  }
  u16(): number {
    this.need(2);
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }
  u32(): number {
    this.need(4);
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }
  /** u64 as a JS number (exact below 2^53). */
  u64(): number {
    this.need(8);
    const lo = this.view.getUint32(this.pos, true);
    const hi = this.view.getUint32(this.pos + 4, true);
    this.pos += 8;
    return hi * 4294967296 + lo;
  }
  i64(): number {
    this.need(8);
    const lo = this.view.getUint32(this.pos, true);
    const hi = this.view.getInt32(this.pos + 4, true);
    this.pos += 8;
    return hi * 4294967296 + lo;
  }
  /** 128-bit little endian as an approximate JS number. */
  i128(): number {
    this.need(16);
    let v = 0;
    for (let i = 15; i >= 0; i--) v = v * 256 + this.bytes[this.pos + i]!;
    const neg = (this.bytes[this.pos + 15]! & 0x80) !== 0;
    this.pos += 16;
    return neg ? v - 2 ** 128 : v;
  }
  u128(): number {
    this.need(16);
    let v = 0;
    for (let i = 15; i >= 0; i--) v = v * 256 + this.bytes[this.pos + i]!;
    this.pos += 16;
    return v;
  }
  pubkey(): string {
    this.need(32);
    const s = base58Encode(this.bytes.subarray(this.pos, this.pos + 32));
    this.pos += 32;
    return s;
  }
  string(maxLen = 4096): string {
    const len = this.u32();
    if (len > maxLen) throw new OutOfData();
    this.need(len);
    const s = utf8.decode(this.bytes.subarray(this.pos, this.pos + len));
    this.pos += len;
    return s;
  }
  skip(n: number) {
    this.need(n);
    this.pos += n;
  }
}

export function bytesEqualPrefix(a: Uint8Array, prefix: ArrayLike<number>): boolean {
  if (a.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) if (a[i] !== prefix[i]) return false;
  return true;
}
