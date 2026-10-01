/**
 * Durable storage on the server's disk (DATA_DIR):
 *   state.json             positions, settings, balances — atomic write (tmp + fsync + rename)
 *   journal/YYYY-MM-DD.jsonl   append-only audit log of every decision and fill
 *   samples/YYYY-MM-DD.jsonl   labelled outcomes (what the learner trains on)
 *   record/YYYY-MM-DDTHH.jsonl.gz  raw market events (for exact replays / research)
 *   models/current.json    the scoring model in use (+ history)
 *   wallets.json.gz        wallet intelligence snapshot
 *
 * Everything stays within a size budget and leaves the disk room (enforceBudget): the oldest
 * raw recordings go first, then old samples; trading state, models, the Lab and the autopilot
 * are never touched.
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
  statfsSync,
  writeSync,
  type WriteStream,
} from "node:fs";
import { join } from "node:path";
import { getHeapStatistics } from "node:v8";
import { createGzip, gunzipSync, gzipSync, type Gzip } from "node:zlib";
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";
import { createGunzip, constants as zlibConstants } from "node:zlib";
import { StringDecoder } from "node:string_decoder";
import type { PersistedState } from "../core/engine.js";
import type { ModelSpec } from "../core/model.js";
import { validateModel } from "../core/model.js";
import type { Sample } from "../core/outcomes.js";
import { type Logger, runSteps, runStepsAsync } from "../core/util.js";

const day = (ts: number) => new Date(ts).toISOString().slice(0, 10);

/** How much the data may take, and how much of the disk must stay free (MB). */
export interface StorageBudget {
  maxMb: number;
  minFreeMb: number;
  /** samples of the newest this many days are always kept (the learner uses the newest ones) */
  keepSampleDays: number;
}

export interface StorageReport {
  usedMb: number;
  byDir: Record<string, number>;
  /** free space on the disk (MB; null when the system does not say) */
  freeMb: number | null;
  recordingPaused: boolean;
}

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

/**
 * How many times SAMPLE_LIMITS this machine's memory allows: more history makes training and
 * the searches more precise, and a desktop can afford it where a 512 MB server cannot. Measured
 * (23 entries, the edge finder with 5 luck checks, then the Lab): 1× — 186 MB at the peak, 24 s
 * and 8 s; 2× — 338 MB, 82 s and 16 s; 4× — 640 MB, 250 s and 39 s. So 2× from a 1.5 GB heap
 * limit, 3× from 3 GB, and no more, to keep a search to about two minutes every two hours.
 */
export function sampleScale(heapLimit = getHeapStatistics().heap_size_limit): number {
  const gb = heapLimit / 1e9;
  return gb >= 3 ? 3 : gb >= 1.5 ? 2 : 1;
}

/** SAMPLE_LIMITS scaled to this machine (sampleScale). */
export function sampleLimits(scale = sampleScale()): typeof SAMPLE_LIMITS {
  return { checkpoints: SAMPLE_LIMITS.checkpoints * scale, structural: SAMPLE_LIMITS.structural * scale, entries: SAMPLE_LIMITS.entries * scale };
}

/**
 * The data folder's limit when DATA_MAX_GB is not set: a fifth of the disk the bot can use (its
 * own data plus what is free), between 10 and 100 GB.
 */
export function autoDataMaxMb(usedMb: number, freeMb: number | null): number {
  if (freeMb === null) return 10_000;
  return Math.round(Math.min(100_000, Math.max(10_000, 0.2 * (usedMb + freeMb))));
}

/**
 * Calls `fn` for every non-empty line, reading 1 MB at a time (multi-byte safe), and pauses
 * after each megabyte (see runSteps) so a live bot is never frozen by a big file.
 */
export function* forEachLineSteps(path: string, fn: (line: string) => void): Generator<void> {
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
      yield;
    }
    rest += dec.end();
    if (rest) fn(rest);
  } finally {
    closeSync(fd);
  }
}

/** The same in one go. */
export function forEachLine(path: string, fn: (line: string) => void) {
  runSteps(forEachLineSteps(path, fn));
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
  private recStream: { key: string; gz: Gzip; file: WriteStream; path: string } | null = null;
  recorded = 0;
  /** raw recording is paused while the disk has too little room (enforceBudget) */
  recordingPaused = false;
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
  loadSamples(days: number, now = Date.now(), limits = sampleLimits()): Sample[] {
    return runSteps(this.loadSamplesSteps(days, now, limits));
  }

  /** The same, pausing every few milliseconds so trading goes on while days of samples are read. */
  loadSamplesAsync(days: number, now = Date.now(), limits = sampleLimits()): Promise<Sample[]> {
    return runStepsAsync(this.loadSamplesSteps(days, now, limits));
  }

  private *loadSamplesSteps(days: number, now: number, limits: typeof SAMPLE_LIMITS): Generator<void, Sample[]> {
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
      line.includes('"kind":"moment"') ? "st" : !line.includes('"kind":"checkpoint"') ? "en" : line.includes('"tag":"prog') || line.includes('"tag":"mig') ? "st" : "cp";
    for (const f of files) {
      const room: Record<Bucket, number> = { cp: cap.cp - used.cp, st: cap.st - used.st, en: cap.en - used.en };
      if (room.cp <= 0 && room.st <= 0 && room.en <= 0) break;
      const got: Record<Bucket, Sample[]> = { cp: [], st: [], en: [] };
      try {
        yield* forEachLineSteps(join(this.dir, "samples", f), (line) => {
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
    if (this.recordingPaused) return;
    const key = hour(ts);
    if (!this.recStream || this.recStream.key !== key) {
      this.closeRecorder();
      const gz = createGzip({ level: 6 });
      // a file of its own each time: appending after a crash would put the rest behind a broken
      // piece that stops every reader (…T17.jsonl.gz, then …T17_02.jsonl.gz, in time order)
      let path = join(this.dir, "record", `${key}.jsonl.gz`);
      for (let n = 2; existsSync(path); n++) path = join(this.dir, "record", `${key}_${String(n).padStart(2, "0")}.jsonl.gz`);
      const file = createWriteStream(path, { flags: "a" });
      file.on("error", (e) => this.log.error("recorder write failed", { err: String(e) }));
      gz.pipe(file);
      this.recStream = { key, gz, file, path };
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
    this.pruneModels();
  }

  /** Earlier models are kept for reference, the newest few only (with trees each is ~100 KB). */
  private pruneModels(keep = 20) {
    try {
      const dir = join(this.dir, "models");
      const old = readdirSync(dir)
        .filter((f) => f.endsWith(".json") && f !== "current.json" && f !== "history.json")
        .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t)
        .slice(keep);
      for (const x of old) rmSync(join(dir, x.f), { force: true });
    } catch (e) {
      this.log.warn("could not prune old models", { err: String(e) });
    }
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

  /** The self-check's own state (when the last daily check-up went out). */
  saveSelfCheck(state: unknown) {
    writeFileAtomic(join(this.dir, "selfcheck.json"), JSON.stringify(state));
  }

  loadSelfCheck(): unknown {
    const p = join(this.dir, "selfcheck.json");
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, "utf8"));
    } catch {
      return null;
    }
  }

  /** The autopilot's state: the rule in use, the user's own rule, benched rules, decisions. */
  saveAutopilot(state: unknown) {
    writeFileAtomic(join(this.dir, "autopilot.json"), JSON.stringify(state));
  }

  loadAutopilot(): unknown {
    const p = join(this.dir, "autopilot.json");
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, "utf8"));
    } catch {
      return null;
    }
  }

  /** The Lab (core/lab): the ideas being tested, their results so far, and the retired ones. */
  saveLab(state: unknown) {
    writeFileAtomic(join(this.dir, "lab.json"), JSON.stringify(state));
  }

  loadLab(): unknown {
    const p = join(this.dir, "lab.json");
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, "utf8"));
    } catch {
      return null;
    }
  }

  /** What each training run tried and decided (the dashboard's learning history). */
  saveLearnHistory(runs: unknown[]) {
    writeFileAtomic(join(this.dir, "models", "history.json"), JSON.stringify(runs));
  }

  loadLearnHistory(): unknown[] {
    const p = join(this.dir, "models", "history.json");
    if (!existsSync(p)) return [];
    try {
      const runs = JSON.parse(readFileSync(p, "utf8"));
      return Array.isArray(runs) ? runs : [];
    } catch {
      return [];
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

  /** Free space on the disk holding the data, MB (null when the system does not say). */
  freeMb(): number | null {
    try {
      const st = statfsSync(this.dir);
      return Math.round((Number(st.bavail) * Number(st.bsize)) / 1e6);
    } catch {
      return null;
    }
  }

  /** What the data takes, folder by folder, and what the disk has left. */
  storageReport(): StorageReport {
    const byDir: Record<string, number> = {};
    let total = 0;
    try {
      for (const f of readdirSync(this.dir)) {
        const p = join(this.dir, f);
        const st = statSync(p);
        const size = st.isDirectory() ? dirBytes(p) : st.size;
        const k = st.isDirectory() ? f : "other";
        byDir[k] = (byDir[k] ?? 0) + size / 1e6;
        total += size;
      }
    } catch {
      /* ignore */
    }
    for (const k of Object.keys(byDir)) byDir[k] = Math.round(byDir[k]!);
    return { usedMb: Math.round(total / 1e6), byDir, freeMb: this.freeMb(), recordingPaused: this.recordingPaused };
  }

  /**
   * Keeps the data within `b.maxMb` and at least `b.minFreeMb` of the disk free, deleting, oldest
   * first: raw recordings (only replays use them), then samples older than the newest
   * `b.keepSampleDays` days (training and the searches use the newest ones), then journals older
   * than a week. Trading state, models, the Lab and the autopilot are never touched. When the disk
   * still has too little room, raw recording pauses, and resumes once there is twice the minimum.
   */
  enforceBudget(b: StorageBudget, now = Date.now()): { freedMb: number; deleted: number; samplesPruned: boolean; paused: boolean; resumed: boolean } {
    const list = (sub: string) => {
      try {
        return readdirSync(join(this.dir, sub))
          .filter((f) => f.endsWith(".jsonl") || f.endsWith(".jsonl.gz"))
          .sort()
          .map((f) => {
            const p = join(this.dir, sub, f);
            return { f, p, mb: statSync(p).size / 1e6 };
          });
      } catch {
        return [];
      }
    };
    let used = dirBytes(this.dir) / 1e6;
    let free = this.freeMb() ?? Infinity;
    let freedMb = 0;
    let deleted = 0;
    let samplesPruned = false;
    const need = () => Math.max(used - b.maxMb, b.minFreeMb - free);
    const del = (x: { p: string; mb: number }) => {
      try {
        rmSync(x.p, { force: true });
      } catch {
        return;
      }
      used -= x.mb;
      free += x.mb;
      freedMb += x.mb;
      deleted++;
    };
    for (const x of list("record")) {
      if (need() <= 0) break;
      if (x.p !== this.recStream?.path) del(x);
    }
    const keepSamplesFrom = day(now - (Math.max(1, b.keepSampleDays) - 1) * 86_400_000);
    for (const x of list("samples")) {
      if (need() <= 0 || x.f.slice(0, 10) >= keepSamplesFrom) break;
      del(x);
      samplesPruned = true;
    }
    const keepJournalFrom = day(now - 6 * 86_400_000);
    for (const x of list("journal")) {
      if (need() <= 0 || x.f.slice(0, 10) >= keepJournalFrom) break;
      del(x);
    }
    const wasPaused = this.recordingPaused;
    if (free < b.minFreeMb) {
      this.recordingPaused = true;
      this.closeRecorder();
    } else if (wasPaused && free >= 2 * b.minFreeMb) this.recordingPaused = false;
    return { freedMb: Math.round(freedMb), deleted, samplesPruned, paused: !wasPaused && this.recordingPaused, resumed: wasPaused && !this.recordingPaused };
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

/** Bytes in a folder and everything below it. */
function dirBytes(d: string): number {
  let total = 0;
  try {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      const st = statSync(p);
      total += st.isDirectory() ? dirBytes(p) : st.size;
    }
  } catch {
    /* ignore */
  }
  return total;
}

/** Stream a recorded .jsonl.gz file line by line (for replays); a file cut short by a crash yields what it holds. */
export async function* readRecording(path: string): AsyncGenerator<unknown> {
  const rl = createInterface({ input: createReadStream(path).pipe(createGunzip({ finishFlush: zlibConstants.Z_SYNC_FLUSH })), crlfDelay: Infinity });
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
