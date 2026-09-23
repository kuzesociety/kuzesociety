/**
 * Durable storage on the server's disk (DATA_DIR):
 *   state.json             positions, settings, balances — atomic write (tmp + fsync + rename)
 *   journal/YYYY-MM-DD.jsonl   append-only audit log of every decision and fill
 *   samples/YYYY-MM-DD.jsonl   labelled outcomes (what the learner trains on)
 *   record/YYYY-MM-DDTHH.jsonl.gz  raw market events (for exact replays / research)
 *   models/current.json    the scoring model in use (+ history)
 *   wallets.json.gz        wallet intelligence snapshot
 */
import {
  closeSync,
  createWriteStream,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
  type WriteStream,
} from "node:fs";
import { join } from "node:path";
import { createGzip, gunzipSync, gzipSync, type Gzip } from "node:zlib";
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { StringDecoder } from "node:string_decoder";
import type { PersistedState } from "../core/engine.js";
import type { ModelSpec } from "../core/model.js";
import { validateModel } from "../core/model.js";
import type { Sample } from "../core/outcomes.js";
import type { Logger } from "../core/util.js";

const day = (ts: number) => new Date(ts).toISOString().slice(0, 10);

/**
 * Most samples held in memory at once. A day of live pump.fun can record tens of thousands,
 * and a small server has 512 MB, so reports and training use the newest ones up to these caps.
 */
/**
 * Samples kept in memory when loading, newest first. Fixed points late in a coin's life (a
 * share of the curve, after graduation) are rare next to the age snapshots every coin gets,
 * so they have their own room and are not crowded out.
 */
export const SAMPLE_LIMITS = { checkpoints: 40_000, structural: 20_000, entries: 25_000 };

/** Calls `fn` for every non-empty line, reading 1 MB at a time (multi-byte safe). */
export function forEachLine(path: string, fn: (line: string) => void) {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.allocUnsafe(1 << 20);
    const dec = new StringDecoder("utf8");
    let rest = "";
    for (;;) {
      const n = readSync(fd, buf, 0, buf.length, null);
      if (n <= 0) break;
      const lines = (rest + dec.write(buf.subarray(0, n))).split("\n");
      rest = lines.pop() ?? "";
      for (const l of lines) if (l) fn(l);
    }
    rest += dec.end();
    if (rest) fn(rest);
  } finally {
    closeSync(fd);
  }
}
const hour = (ts: number) => new Date(ts).toISOString().slice(0, 13);

export function writeFileAtomic(path: string, data: string | Uint8Array) {
  const tmp = `${path}.tmp-${process.pid}`;
  const fd = openSync(tmp, "w");
  try {
    writeSync(fd, typeof data === "string" ? Buffer.from(data) : data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  // Windows may hold the target for a moment (antivirus, search indexer, OneDrive): renaming
  // over it then fails with EPERM/EBUSY/EACCES — wait a little and try again
  for (let attempt = 1; ; attempt++) {
    try {
      renameSync(tmp, path);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (attempt >= 6 || !(code === "EPERM" || code === "EBUSY" || code === "EACCES")) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15 * attempt);
    }
  }
}

export class DataStore {
  readonly dir: string;
  private recStream: { key: string; gz: Gzip; file: WriteStream } | null = null;
  recorded = 0;
  private journalLines: string[] = [];
  private sampleLines: string[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(dir: string, private log: Logger) {
    this.dir = dir;
    for (const sub of ["", "journal", "samples", "record", "models", "reports"]) mkdirSync(join(dir, sub), { recursive: true });
    this.flushTimer = setInterval(() => this.flush(), 1_000);
    this.flushTimer.unref?.();
  }

  // ---- state -------------------------------------------------------------------

  saveState(s: PersistedState) {
    writeFileAtomic(join(this.dir, "state.json"), JSON.stringify(s));
  }

  loadState(): PersistedState | null {
    for (const name of ["state.json", "state.json.bak"]) {
      const p = join(this.dir, name);
      if (!existsSync(p)) continue;
      try {
        const s = JSON.parse(readFileSync(p, "utf8"));
        if (s && s.v === 1) return s as PersistedState;
      } catch (e) {
        this.log.error(`could not read ${name}`, { err: String(e) });
      }
    }
    return null;
  }

  /** Daily backup copy so a corrupted disk write can never lose everything. */
  backupState() {
    const p = join(this.dir, "state.json");
    if (existsSync(p)) {
      try {
        writeFileAtomic(join(this.dir, "state.json.bak"), readFileSync(p));
      } catch (e) {
        this.log.warn("state backup failed", { err: String(e) });
      }
    }
  }

  // ---- journal & samples (buffered, flushed every second) ------------------------

  journal(entry: Record<string, unknown>) {
    this.journalLines.push(JSON.stringify(entry));
  }

  sample(s: Sample) {
    this.sampleLines.push(JSON.stringify(s));
  }

  flush() {
    const now = Date.now();
    try {
      if (this.journalLines.length) {
        const lines = this.journalLines.splice(0);
        appendLines(join(this.dir, "journal", `${day(now)}.jsonl`), lines);
      }
      if (this.sampleLines.length) {
        const lines = this.sampleLines.splice(0);
        appendLines(join(this.dir, "samples", `${day(now)}.jsonl`), lines);
      }
    } catch (e) {
      this.log.error("journal/sample flush failed", { err: String(e) });
    }
  }

  /**
   * Labelled samples from the last `days`, oldest first. Files are read newest first and
   * line by line, keeping at most `limits` checkpoints and entries (signal + entry kinds),
   * so memory stays bounded however much has been recorded.
   */
  loadSamples(days: number, now = Date.now(), limits = SAMPLE_LIMITS): Sample[] {
    const cutoff = day(now - days * 86_400_000);
    let files: string[] = [];
    try {
      files = readdirSync(join(this.dir, "samples"))
        .filter((f) => f.endsWith(".jsonl") && f.slice(0, 10) >= cutoff)
        .sort()
        .reverse();
    } catch {
      return [];
    }
    const perFile: Sample[][] = [];
    type Bucket = "cp" | "st" | "en";
    const cap: Record<Bucket, number> = { cp: limits.checkpoints, st: limits.structural, en: limits.entries };
    const used: Record<Bucket, number> = { cp: 0, st: 0, en: 0 };
    const bucketOf = (line: string): Bucket =>
      !line.includes('"kind":"checkpoint"') ? "en" : line.includes('"tag":"prog') || line.includes('"tag":"mig') ? "st" : "cp";
    for (const f of files) {
      const room: Record<Bucket, number> = { cp: cap.cp - used.cp, st: cap.st - used.st, en: cap.en - used.en };
      if (room.cp <= 0 && room.st <= 0 && room.en <= 0) break;
      const got: Record<Bucket, Sample[]> = { cp: [], st: [], en: [] };
      try {
        forEachLine(join(this.dir, "samples", f), (line) => {
          const b = bucketOf(line);
          if (room[b] <= 0) return; // skip parsing what would be dropped
          let s: Sample;
          try {
            s = JSON.parse(line) as Sample;
          } catch {
            return; // partial line
          }
          if (!Array.isArray(s.x) || (s.y !== 0 && s.y !== 1)) return;
          const into = got[b];
          into.push(s);
          // lines are in time order: when over the cap, drop the oldest
          if (into.length >= room[b] * 2) into.splice(0, into.length - room[b]);
        });
      } catch (e) {
        this.log.warn("could not read samples", { file: f, err: String(e) });
        continue;
      }
      for (const b of ["cp", "st", "en"] as const) {
        if (got[b].length > room[b]) got[b].splice(0, got[b].length - Math.max(0, room[b]));
        used[b] += got[b].length;
      }
      perFile.push(got.cp.concat(got.st, got.en));
    }
    return perFile.reverse().flat().sort((a, b) => a.ts - b.ts);
  }

  // ---- market recorder (gzip, hourly files) ----------------------------------------

  record(ev: unknown, ts: number) {
    const key = hour(ts);
    if (!this.recStream || this.recStream.key !== key) {
      this.closeRecorder();
      const gz = createGzip({ level: 6 });
      const file = createWriteStream(join(this.dir, "record", `${key}.jsonl.gz`), { flags: "a" });
      file.on("error", (e) => this.log.error("recorder write failed", { err: String(e) }));
      gz.pipe(file);
      this.recStream = { key, gz, file };
    }
    this.recStream.gz.write(JSON.stringify(ev) + "\n");
    this.recorded++;
  }

  closeRecorder() {
    if (this.recStream) {
      this.recStream.gz.end();
      this.recStream = null;
    }
  }

  recordFiles(): string[] {
    try {
      return readdirSync(join(this.dir, "record"))
        .filter((f) => f.endsWith(".jsonl.gz"))
        .sort()
        .map((f) => join(this.dir, "record", f));
    } catch {
      return [];
    }
  }

  // ---- models ----------------------------------------------------------------------

  saveModel(m: ModelSpec) {
    writeFileAtomic(join(this.dir, "models", "current.json"), JSON.stringify(m, null, 1));
    const safe = m.version.replace(/[^A-Za-z0-9_.-]/g, "_");
    writeFileAtomic(join(this.dir, "models", `${safe}.json`), JSON.stringify(m));
  }

  loadModel(): ModelSpec | null {
    const p = join(this.dir, "models", "current.json");
    if (!existsSync(p)) return null;
    try {
      const m = JSON.parse(readFileSync(p, "utf8"));
      return validateModel(m) ? m : null;
    } catch {
      return null;
    }
  }

  // ---- edge finder -----------------------------------------------------------------

  saveEdges(report: unknown) {
    writeFileAtomic(join(this.dir, "edges.json"), JSON.stringify(report));
  }

  loadEdges(): unknown {
    const p = join(this.dir, "edges.json");
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, "utf8"));
    } catch {
      return null;
    }
  }

  // ---- wallets ---------------------------------------------------------------------

  saveWallets(snap: unknown) {
    writeFileAtomic(join(this.dir, "wallets.json.gz"), gzipSync(JSON.stringify(snap)));
  }

  loadWallets(): unknown {
    const p = join(this.dir, "wallets.json.gz");
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(gunzipSync(readFileSync(p)).toString("utf8"));
    } catch {
      return null;
    }
  }

  // ---- misc --------------------------------------------------------------------------

  readSecret(): string | null {
    const p = join(this.dir, "secret.json");
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, "utf8")).token ?? null;
    } catch {
      return null;
    }
  }

  writeSecret(token: string) {
    writeFileAtomic(join(this.dir, "secret.json"), JSON.stringify({ token }));
  }

  /** Delete recordings/samples/journals past their retention. */
  cleanup(recordDays: number, sampleDays: number, now = Date.now()) {
    const prune = (sub: string, days: number) => {
      const cutoff = day(now - days * 86_400_000);
      try {
        for (const f of readdirSync(join(this.dir, sub))) if (f.slice(0, 10) < cutoff) rmSync(join(this.dir, sub, f), { force: true });
      } catch {
        /* ignore */
      }
    };
    prune("record", recordDays);
    prune("samples", sampleDays);
    prune("journal", Math.max(sampleDays, 30));
  }

  diskUsageMb(): number {
    let total = 0;
    const walk = (d: string) => {
      try {
        for (const f of readdirSync(d)) {
          const p = join(d, f);
          const st = statSync(p);
          if (st.isDirectory()) walk(p);
          else total += st.size;
        }
      } catch {
        /* ignore */
      }
    };
    walk(this.dir);
    return Math.round(total / 1e6);
  }

  close() {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flush();
    this.closeRecorder();
  }
}

function appendLines(path: string, lines: string[]) {
  const fd = openSync(path, "a");
  try {
    writeSync(fd, lines.join("\n") + "\n");
  } finally {
    closeSync(fd);
  }
}

/** Stream a recorded .jsonl.gz file line by line (for replays). */
export async function* readRecording(path: string): AsyncGenerator<unknown> {
  const rl = createInterface({ input: createReadStream(path).pipe(createGunzip()), crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      if (!line) continue;
      try {
        yield JSON.parse(line);
      } catch {
        /* truncated last line of a crashed hour */
      }
    }
  } catch {
    /* truncated gzip tail after a crash: keep what we read */
  }
}
