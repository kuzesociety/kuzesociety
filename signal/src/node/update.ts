/**
 * Updates for a bot installed from the ZIP download (the Windows and Mac starters). It checks
 * GitHub for a newer build and — on request, or by itself when `auto` is on — downloads the same
 * ZIP a person would, verifies it, keeps a copy of every file it replaces, writes its signal/
 * folder over this install, test-starts the new bot (`--boot-check`), and restarts. A version
 * that does not start is put back at once; one that keeps stopping after the restart is put back
 * by the next start (guardStartup). data/ (keys, settings, trade history, open trades), .env and
 * node_modules are never touched: open trades stay open and the new version manages them.
 *
 * dist/version.json holds a fingerprint of the built bot, so a version differs exactly when
 * the bot itself changed.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { inflateRawSync } from "node:zlib";
import type { Logger } from "../core/util.js";

const REPO = "kuzesociety/kuzesociety";
const BRANCH = "claude/signal-meme-trading-bot-o142hw";
export const UPDATE_ZIP_URL = `https://github.com/${REPO}/archive/refs/heads/${BRANCH}.zip`;
export const UPDATE_VERSION_URL = `https://raw.githubusercontent.com/${REPO}/refs/heads/${BRANCH}/signal/dist/version.json`;

/** Never written by an update: the user's own files. */
const KEEP = ["data", "node_modules", ".env", "work"];
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
    for (let attempt = 1; !replaced(tmp, target, rel, attempt); attempt++) await sleep(250 * attempt);
    changed++;
  }
  return changed;
}

/**
 * Renames `tmp` over `target`: true when done, false to try again (Windows may hold a
 * just-written file for a moment, for an antivirus scan); throws after the 8th attempt.
 */
function replaced(tmp: string, target: string, rel: string, attempt: number): boolean {
  try {
    renameSync(tmp, target);
    return true;
  } catch (err) {
    if (attempt < 8) return false;
    rmSync(tmp, { force: true });
    throw new Error(`could not replace ${rel}: ${(err as Error).message}`);
  }
}

const waitSync = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// ---- keeping the previous version, and putting it back ----------------------------------

/** What an update replaced, so it can be put back: the old copies are in `<backup>/files/`. */
export interface UpdateBackup {
  from: string | null;
  to: string;
  at: number;
  /** files that existed and were replaced (their old copies are kept) */
  replaced: string[];
  /** files the update added (removed when putting the old version back) */
  added: string[];
}

/** Keeps a copy of every file the update will replace, and notes the ones it adds. */
export function backupFiles(dir: string, files: Map<string, ZipEntry>, backupDir: string, from: string | null, to: string): UpdateBackup {
  rmSync(backupDir, { recursive: true, force: true });
  mkdirSync(join(backupDir, "files"), { recursive: true });
  const b: UpdateBackup = { from, to, at: Date.now(), replaced: [], added: [] };
  for (const [rel, e] of files) {
    const target = join(dir, ...rel.split("/"));
    let old: Buffer;
    try {
      old = readFileSync(target);
    } catch {
      b.added.push(rel);
      continue;
    }
    if (old.equals(e.data)) continue;
    const copy = join(backupDir, "files", ...rel.split("/"));
    mkdirSync(dirname(copy), { recursive: true });
    writeFileSync(copy, old);
    b.replaced.push(rel);
  }
  writeFileSync(join(backupDir, "backup.json"), JSON.stringify(b));
  return b;
}

/**
 * Puts the version kept in `backupDir` back over the install; null when none is kept. Throws
 * when a file cannot be put back, keeping the copy, so that trying again finishes the job.
 */
export function restoreBackup(dir: string, backupDir: string): UpdateBackup | null {
  let b: UpdateBackup;
  try {
    b = JSON.parse(readFileSync(join(backupDir, "backup.json"), "utf8")) as UpdateBackup;
  } catch {
    return null;
  }
  // the version file last, so it only claims the old version once the old bot is back
  const order = [...b.replaced].sort((x, y) => Number(x === "dist/version.json") - Number(y === "dist/version.json"));
  for (const rel of order) {
    const target = join(dir, ...rel.split("/"));
    const tmp = `${target}.restoring`;
    writeFileSync(tmp, readFileSync(join(backupDir, "files", ...rel.split("/"))));
    for (let attempt = 1; !replaced(tmp, target, rel, attempt); attempt++) waitSync(250 * attempt);
  }
  for (const rel of b.added) rmSync(join(dir, ...rel.split("/")), { force: true });
  rmSync(backupDir, { recursive: true, force: true });
  return b;
}

/** Test-starts the installed bot without trading or serving anything: true when it came up. */
export function bootCheck(dir: string, env: NodeJS.ProcessEnv = process.env, timeoutMs = 90_000): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(ok);
    };
    const child = spawn(process.execPath, [join(dir, "dist", "engine.mjs"), "--boot-check"], { cwd: dir, env, stdio: "ignore", windowsHide: true });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(false);
    }, timeoutMs);
    child.on("error", () => finish(false));
    child.on("exit", (code) => finish(code === 0));
  });
}

/** An update waiting to prove itself: started this many times since it was installed. */
interface Pending {
  from: string | null;
  to: string;
  at: number;
  starts: number;
  /** installed by itself (not on request) */
  auto?: boolean;
}

/** What guardStartup found: no update on trial, one on trial (started `starts` times), or one put back. */
export interface StartupTrial {
  state: "none" | "trying" | "rolledBack";
  from?: string | null;
  to?: string | null;
  starts?: number;
  auto?: boolean;
  /** the version on trial is kept: it ran long enough */
  confirm: () => void;
}

/**
 * Called first thing at every start. After an update, a new version that keeps stopping (more
 * than `maxStarts` starts within `windowMs`) is put back and marked bad, so it is not installed
 * by itself again; "rolledBack" then means: restart now, into the previous version. The caller
 * keeps a version that stays up long enough (confirm).
 */
export function guardStartup(
  dir: string,
  dataDir: string,
  now = Date.now(),
  o: { maxStarts?: number; windowMs?: number } = {},
): StartupTrial {
  const pendingFile = join(dataDir, "update-pending.json");
  const confirm = () => rmSync(pendingFile, { force: true });
  let p: Pending;
  try {
    p = JSON.parse(readFileSync(pendingFile, "utf8")) as Pending;
    if (typeof p.to !== "string" || !Number.isFinite(p.at) || !Number.isFinite(p.starts)) throw new Error("not a pending update");
  } catch {
    confirm();
    return { state: "none", confirm };
  }
  p.starts++;
  writeFileSync(pendingFile, JSON.stringify(p));
  if (p.starts <= (o.maxStarts ?? 3) || now - p.at >= (o.windowMs ?? 30 * 60_000)) return { state: "trying", from: p.from, to: p.to, starts: p.starts, auto: !!p.auto, confirm };
  // kept stopping: never again by itself, and back to the version before it when one was kept
  markBad(dataDir, p.to);
  const back = restoreBackup(dir, join(dataDir, "update-backup"));
  confirm();
  if (!back) return { state: "none", confirm };
  writeFileSync(join(dataDir, "update-rolledback.json"), JSON.stringify({ from: p.to, to: p.from, at: now }));
  return { state: "rolledBack", from: p.to, to: p.from, starts: p.starts, auto: !!p.auto, confirm };
}

/** Said once after a version was put back by guardStartup: which, and which runs now. Removed when read. */
export function takeRollbackNote(dataDir: string): { from: string; to: string | null } | null {
  const f = join(dataDir, "update-rolledback.json");
  try {
    const r = JSON.parse(readFileSync(f, "utf8")) as { from: string; to: string | null };
    rmSync(f, { force: true });
    return typeof r.from === "string" ? r : null;
  } catch {
    return null;
  }
}

const badFile = (dataDir: string) => join(dataDir, "update-bad");
function markBad(dataDir: string, version: string) {
  try {
    writeFileSync(badFile(dataDir), `${[...new Set([...badVersions(dataDir), version])].slice(-20).join("\n")}\n`);
  } catch {
    /* best effort */
  }
}
/** Versions that did not start or kept stopping: never installed by themselves again. */
export function badVersions(dataDir: string): string[] {
  try {
    return readFileSync(badFile(dataDir), "utf8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
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
  /** installs new versions by itself */
  auto: boolean;
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
  /** install new versions by themselves, as soon as `ready` allows */
  auto?: boolean;
  /** false while installing now would interrupt something (an order being placed or sold); `waitedMs`: how long this version has waited */
  ready?: (waitedMs: number) => boolean;
  /** how often `ready` is asked again (default a minute) */
  waitMs?: number;
  /** where the version being replaced is kept (default: data/update-backup in the install) */
  dataDir?: string;
  /** test-starts the installed bot (default: bootCheck) */
  bootCheck?: (dir: string) => Promise<boolean>;
  /** a new version was installed by itself and the bot is restarting into it */
  onAutoUpdated?: (from: string | null, to: string) => void;
  /**
   * Installing a new version by itself failed (said once per version). `again`: it is tried again at
   * the next check; false for a version that did not start (it was put back and is not tried again).
   */
  onFailed?: (version: string, why: string, again: boolean) => void;
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
      auto: !!this.o.auto && this.can,
    };
  }

  get available() {
    return !!this.latest && this.latest !== this.current;
  }

  /** Checks now, then every few hours. Only a copy that can update itself looks. */
  start() {
    if (!this.can) return;
    const first = setTimeout(() => void this.check(), this.o.firstCheckMs ?? 20_000);
    // updating by itself looks every half hour, so what is pushed reaches the bot soon
    const every = setInterval(() => void this.check(), this.o.checkEveryMs ?? (this.o.auto ? 30 * 60_000 : 6 * 3_600_000));
    first.unref?.();
    every.unref?.();
    this.timers.push(first, every);
  }

  stop() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    if (this.waiting) clearTimeout(this.waiting);
    this.waiting = null;
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
      if (this.available) {
        this.announce(v);
        if (this.o.auto) this.autoApply(v);
      }
    } catch (e) {
      this.o.log.warn("update check failed", { err: String((e as Error).message ?? e) });
    }
    return this.status();
  }

  private waiting: NodeJS.Timeout | null = null;
  private failedNoted = new Set<string>();

  /** Installs `v` by itself as soon as `ready` allows (checked every minute); never a version that failed before. */
  private autoApply(v: string) {
    if (this.waiting || this.busy || badVersions(this.dataDir).includes(v)) return;
    const since = Date.now();
    const attempt = () => {
      this.waiting = null;
      if (this.o.ready && !this.o.ready(Date.now() - since)) {
        this.waiting = setTimeout(attempt, this.o.waitMs ?? 60_000);
        this.waiting.unref?.();
        return;
      }
      const from = this.current;
      void this.apply({ auto: true }).then((r) => {
        if (r.ok && !r.upToDate) this.o.onAutoUpdated?.(from, r.version);
        if (r.ok || this.failedNoted.has(v)) return;
        this.failedNoted.add(v);
        this.o.onFailed?.(v, this.error ?? r.error, !badVersions(this.dataDir).includes(v));
      });
    };
    attempt();
  }

  private get dataDir() {
    return this.o.dataDir ?? join(this.o.installDir ?? ".", "data");
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
  async apply(o: { auto?: boolean } = {}): Promise<UpdateResult> {
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
      // keep what is replaced, install, and test-start the new bot before switching to it
      const dir = this.o.installDir!;
      const backupDir = join(this.dataDir, "update-backup");
      backupFiles(dir, files, backupDir, this.current, version);
      let changed = 0;
      try {
        changed = await installFiles(dir, files);
        if (!(await (this.o.bootCheck ?? bootCheck)(dir))) {
          markBad(this.dataDir, version);
          throw new Error(`version ${version} did not start on this computer`);
        }
      } catch (e) {
        restoreBackup(dir, backupDir);
        throw new Error(`${(e as Error).message} — the version running now was put back`);
      }
      const pending: Pending = { from: this.current, to: version, at: Date.now(), starts: 0, auto: !!o.auto };
      writeFileSync(join(this.dataDir, "update-pending.json"), JSON.stringify(pending));
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
