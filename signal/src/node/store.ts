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
import type { PersistedState } from "../core/engine.js";
import type { ModelSpec } from "../core/model.js";
import { validateModel } from "../core/model.js";
import type { Sample } from "../core/outcomes.js";
import type { Logger } from "../core/util.js";

const day = (ts: number) => new Date(ts).toISOString().slice(0, 10);
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
  renameSync(tmp, path);
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

  loadSamples(days: number, now = Date.now()): Sample[] {
    const out: Sample[] = [];
    const cutoff = day(now - days * 86_400_000);
    let files: string[] = [];
    try {
      files = readdirSync(join(this.dir, "samples")).filter((f) => f.endsWith(".jsonl") && f.slice(0, 10) >= cutoff).sort();
    } catch {
      return out;
    }
    for (const f of files) {
      const text = readFileSync(join(this.dir, "samples", f), "utf8");
      for (const line of text.split("\n")) {
        if (!line) continue;
        try {
          const s = JSON.parse(line) as Sample;
          if (Array.isArray(s.x) && (s.y === 0 || s.y === 1)) out.push(s);
        } catch {
          /* skip partial line */
        }
      }
    }
    return out;
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
