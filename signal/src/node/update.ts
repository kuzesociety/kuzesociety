/**
 * One-tap updates for a bot installed from the ZIP download (the Windows and Mac starters).
 * It checks GitHub for a newer build, and on request downloads the same ZIP a person would,
 * verifies it, writes its signal/ folder over this install and restarts. data/ (keys,
 * settings, trade history), .env and node_modules are never touched.
 *
 * dist/version.json holds a fingerprint of the built bot, so a version differs exactly when
 * the bot itself changed.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { inflateRawSync } from "node:zlib";
import type { Logger } from "../core/util.js";

const REPO = "kuzesociety/kuzesociety";
const BRANCH = "claude/signal-meme-trading-bot-o142hw";
export const UPDATE_ZIP_URL = `https://github.com/${REPO}/archive/refs/heads/${BRANCH}.zip`;
export const UPDATE_VERSION_URL = `https://raw.githubusercontent.com/${REPO}/refs/heads/${BRANCH}/signal/dist/version.json`;

/** Never written by an update: the user's own files. */
const KEEP = ["data", "node_modules", ".env"];
/** A download without these is not a usable bot. */
const REQUIRED = ["dist/engine.mjs", "dist/version.json", "package.json", "start-windows.bat"];
const MAX_ZIP_BYTES = 60 * 1024 * 1024;

// ---- zip reading ---------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Buffer;
  /** unix permission bits, when the archive was made on unix (GitHub's are) */
  mode: number;
}

/** Reads every file of a zip archive, checking each one's size and checksum. */
export function unzip(buf: Buffer): ZipEntry[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("the download is not a zip file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || p === 0xffffffff) throw new Error("zip64 archives are not supported");
  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error("the download is damaged (zip directory)");
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const next = p + 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    const mode = (buf.readUInt32LE(p + 38) >>> 16) & 0o777;
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p = next;
    if (name.endsWith("/")) continue;
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw new Error(`the download is damaged (${name})`);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    if (start + csize > buf.length) throw new Error(`the download is cut short (${name})`);
    const raw = buf.subarray(start, start + csize);
    let data: Buffer;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = inflateRawSync(raw);
    else throw new Error(`unsupported compression in ${name}`);
    if (data.length !== size || crc32(data) !== crc) throw new Error(`the download is damaged (${name})`);
    out.push({ name, data, mode });
  }
  return out;
}

function safeRelative(rel: string) {
  return rel.length > 0 && !rel.includes("\\") && !rel.includes(":") && rel.split("/").every((s) => s !== "" && s !== "." && s !== "..");
}

/** The bot's own files in a GitHub branch download (<top folder>/signal/…), by path inside the install. */
export function botFiles(entries: ZipEntry[]): Map<string, ZipEntry> {
  const main = entries.find((e) => /^[^/]+\/signal\/dist\/engine\.mjs$/.test(e.name));
  if (!main) throw new Error("the download does not contain the bot");
  const prefix = main.name.slice(0, -"dist/engine.mjs".length);
  const files = new Map<string, ZipEntry>();
  for (const e of entries) {
    if (!e.name.startsWith(prefix)) continue;
    const rel = e.name.slice(prefix.length);
    if (!safeRelative(rel) || KEEP.some((k) => rel === k || rel.startsWith(`${k}/`))) continue;
    files.set(rel, e);
  }
  for (const need of REQUIRED) if (!files.has(need)) throw new Error(`the download is missing ${need}`);
  return files;
}

export function versionOf(json: Buffer | string): string | null {
  try {
    const v = (JSON.parse(String(json)) as { version?: unknown }).version;
    return typeof v === "string" && /^[0-9a-f]{6,64}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function readVersion(installDir: string): string | null {
  try {
    return versionOf(readFileSync(join(installDir, "dist", "version.json")));
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Written last, in this order: until the new bot is in place the old one still starts, and the
 * version file claims the new version only once the bot it describes is there. */
const LAST = ["dist/engine.mjs", "dist/version.json"];

/**
 * Writes the files over the install; unchanged files are left alone. Each file is written
 * next to its target and renamed over it.
 */
export async function installFiles(dir: string, files: Map<string, ZipEntry>): Promise<number> {
  const rank = (rel: string) => LAST.indexOf(rel) + 1;
  const order = [...files.keys()].sort((a, b) => rank(a) - rank(b));
  let changed = 0;
  for (const rel of order) {
    const e = files.get(rel)!;
    const target = join(dir, ...rel.split("/"));
    try {
      if (readFileSync(target).equals(e.data)) continue;
    } catch {
      /* new file */
    }
    mkdirSync(dirname(target), { recursive: true });
    const tmp = `${target}.updating`;
    writeFileSync(tmp, e.data);
    if (process.platform !== "win32" && e.mode & 0o111) chmodSync(tmp, 0o755);
    // Windows may hold a just-written file for a moment (antivirus scan): retry briefly
    for (let attempt = 1; ; attempt++) {
      try {
        renameSync(tmp, target);
        break;
      } catch (err) {
        if (attempt >= 8) {
          rmSync(tmp, { force: true });
          throw new Error(`could not replace ${rel}: ${(err as Error).message}`);
        }
        await sleep(250 * attempt);
      }
    }
    changed++;
  }
  return changed;
}

/** The folder holding package.json at or above `from` (dist/ when bundled, src/node/ in development). */
export function findInstallDir(from: string): string | null {
  let d = from;
  for (let i = 0; i < 4; i++) {
    if (existsSync(join(d, "package.json"))) return d;
    const up = dirname(d);
    if (up === d) break;
    d = up;
  }
  return null;
}

// ---- the updater -----------------------------------------------------------------------

export type UpdateState = "idle" | "downloading" | "installing" | "restarting" | "failed";

export interface UpdateStatus {
  current: string | null;
  latest: string | null;
  checkedAt: number;
  available: boolean;
  /** this copy can update itself */
  can: boolean;
  /** why not, in plain words */
  why: string | null;
  state: UpdateState;
  error: string | null;
}

export type UpdateResult = { ok: true; upToDate: boolean; version: string; files: number; restarting: boolean } | { ok: false; error: string };

export interface UpdaterOptions {
  installDir: string | null;
  /** started by a starter script that restarts the bot and allows self-updates */
  selfUpdate: boolean;
  log: Logger;
  /** restarts the bot (false when nothing would start it again) */
  restart: () => boolean;
  /** a newer version was found (called once per version) */
  onAvailable?: (version: string) => void;
  /** remembers the last version announced, across restarts */
  notedFile?: string;
  zipUrl?: string;
  versionUrl?: string;
  checkEveryMs?: number;
  firstCheckMs?: number;
}

export class Updater {
  private latest: string | null = null;
  private checkedAt = 0;
  private state: UpdateState = "idle";
  private error: string | null = null;
  private busy = false;
  private timers: NodeJS.Timeout[] = [];
  readonly current: string | null;
  private readonly why: string | null;

  constructor(private o: UpdaterOptions) {
    this.current = o.installDir ? readVersion(o.installDir) : null;
    this.why = !o.selfUpdate
      ? "This bot was not started with start-windows.bat or start-mac.command, so it cannot update itself: download the new version, or redeploy it on a server."
      : !o.installDir || !existsSync(join(o.installDir, "dist", "engine.mjs"))
        ? "The bot's folder was not found."
        : existsSync(join(o.installDir, ".git")) || existsSync(join(o.installDir, "..", ".git"))
          ? "This copy is a git checkout: update it with git pull, then npm run build."
          : null;
  }

  get can() {
    return this.why === null;
  }

  status(): UpdateStatus {
    return {
      current: this.current,
      latest: this.latest,
      checkedAt: this.checkedAt,
      available: this.available,
      can: this.can,
      why: this.why,
      state: this.state,
      error: this.error,
    };
  }

  get available() {
    return !!this.latest && this.latest !== this.current;
  }

  /** Checks now, then every few hours. Only a copy that can update itself looks. */
  start() {
    if (!this.can) return;
    const first = setTimeout(() => void this.check(), this.o.firstCheckMs ?? 20_000);
    const every = setInterval(() => void this.check(), this.o.checkEveryMs ?? 6 * 3_600_000);
    first.unref?.();
    every.unref?.();
    this.timers.push(first, every);
  }

  stop() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  async check(): Promise<UpdateStatus> {
    if (this.busy) return this.status();
    try {
      const res = await fetch(this.o.versionUrl ?? UPDATE_VERSION_URL, { signal: AbortSignal.timeout(15_000), headers: { "cache-control": "no-cache" } });
      if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
      const v = versionOf(await res.text());
      if (!v) throw new Error("GitHub sent no version");
      this.latest = v;
      this.checkedAt = Date.now();
      if (this.available) this.announce(v);
    } catch (e) {
      this.o.log.warn("update check failed", { err: String((e as Error).message ?? e) });
    }
    return this.status();
  }

  private announce(v: string) {
    if (!this.o.onAvailable) return;
    try {
      if (this.o.notedFile && existsSync(this.o.notedFile) && readFileSync(this.o.notedFile, "utf8").trim() === v) return;
      if (this.o.notedFile) writeFileSync(this.o.notedFile, v);
    } catch {
      /* best effort */
    }
    this.o.onAvailable(v);
  }

  /** Downloads, checks and installs the newest version, then restarts the bot. */
  async apply(): Promise<UpdateResult> {
    if (!this.can) return { ok: false, error: this.why! };
    if (this.busy) return { ok: false, error: "An update is already running." };
    this.busy = true;
    this.error = null;
    try {
      this.state = "downloading";
      this.o.log.info("update: downloading the newest version");
      const res = await fetch(this.o.zipUrl ?? UPDATE_ZIP_URL, { signal: AbortSignal.timeout(180_000), redirect: "follow" });
      if (!res.ok) throw new Error(`the download failed (GitHub answered ${res.status})`);
      if (Number(res.headers.get("content-length") ?? 0) > MAX_ZIP_BYTES) throw new Error("the download is unexpectedly large");
      const zip = Buffer.from(await res.arrayBuffer());
      if (zip.length > MAX_ZIP_BYTES) throw new Error("the download is unexpectedly large");

      this.state = "installing";
      const files = botFiles(unzip(zip));
      const version = versionOf(files.get("dist/version.json")!.data);
      if (!version) throw new Error("the download has no version");
      this.latest = version;
      this.checkedAt = Date.now();
      if (version === this.current) {
        this.state = "idle";
        return { ok: true, upToDate: true, version, files: 0, restarting: false };
      }
      const changed = await installFiles(this.o.installDir!, files);
      this.o.log.info("update installed — restarting", { from: this.current, to: version, files: changed });
      const restarting = this.o.restart();
      this.state = restarting ? "restarting" : "idle";
      return { ok: true, upToDate: false, version, files: changed, restarting };
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      this.state = "failed";
      this.error = msg;
      this.o.log.error("update failed", { err: msg });
      return { ok: false, error: `Update failed: ${msg}. The bot keeps running the version it has — try again later.` };
    } finally {
      this.busy = false;
    }
  }
}
