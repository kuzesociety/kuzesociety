import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const procs: ChildProcess[] = [];
const dirs: string[] = [];

afterEach(() => {
  for (const p of procs.splice(0)) p.kill("SIGKILL");
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function dataDir() {
  const d = mkdtempSync(join(tmpdir(), "signal-restart-"));
  dirs.push(d);
  return d;
}

function start(dir: string, port: number, extra: Record<string, string> = {}) {
  const proc = spawn(process.execPath, [join(ROOT, "dist/engine.mjs")], {
    cwd: dir,
    env: { ...process.env, SIM: "1", DATA_DIR: dir, PORT: String(port), HOST: "127.0.0.1", DASHBOARD_TOKEN: "t", LEARN_EVERY_HOURS: "0", ...extra },
    stdio: "ignore",
  });
  procs.push(proc);
  const exited = new Promise<number | null>((r) => proc.on("exit", (code) => r(code)));
  return { proc, exited };
}

async function up(port: number) {
  const t0 = Date.now();
  for (;;) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() - t0 > 30_000) throw new Error("server did not start");
    await new Promise((r) => setTimeout(r, 200));
  }
}

const local = { "x-signal": "1", "content-type": "application/json" };
const newPort = () => 20000 + Math.floor(Math.random() * 20000);

describe("restarts, crashes and closing the window", () => {
  it("saves state and exits with 75 so the starter brings it back", async () => {
    const dir = dataDir();
    const port = newPort();
    const { exited } = start(dir, port, { SIGNAL_SUPERVISED: "1" });
    await up(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/restart`, { method: "POST", headers: local, body: "{}" });
    expect(await res.json()).toMatchObject({ ok: true, restarting: true });
    expect(await exited).toBe(75);
    expect(existsSync(join(dir, "state.json"))).toBe(true);
  }, 45_000);

  it("keeps settings through a hard kill (power cut) — they are saved within a moment", async () => {
    const dir = dataDir();
    const port = newPort();
    const first = start(dir, port);
    await up(port);
    const chosen = { enabled: true, minScore: 88, tpPct: 250, slPct: 30, maxHoldMin: 15 };
    const set = await (await fetch(`http://127.0.0.1:${port}/api/settings`, { method: "POST", headers: local, body: JSON.stringify(chosen) })).json();
    expect(set.settings).toMatchObject(chosen);
    await new Promise((r) => setTimeout(r, 1_000));
    first.proc.kill("SIGKILL"); // no chance to save on the way out
    await first.exited;
    const second = start(dir, port);
    await up(port);
    const st = await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();
    expect(st.settings).toMatchObject(chosen);
    second.proc.kill("SIGTERM");
    await second.exited;
  }, 60_000);

  it("saves and stops when its window is closed (SIGHUP)", async () => {
    const dir = dataDir();
    const port = newPort();
    const { proc, exited } = start(dir, port);
    await up(port);
    proc.kill("SIGHUP");
    expect(await exited).toBe(0);
    expect(existsSync(join(dir, "state.json"))).toBe(true);
  }, 45_000);

  it("a second copy on the same computer stops at once with 74", async () => {
    const port = newPort();
    const first = start(dataDir(), port);
    await up(port);
    const secondDir = dataDir();
    const second = start(secondDir, port);
    expect(await second.exited).toBe(74);
    // it stopped before touching anything
    expect(existsSync(join(secondDir, "state.json"))).toBe(false);
    expect((await fetch(`http://127.0.0.1:${port}/healthz`)).ok).toBe(true);
    first.proc.kill("SIGTERM");
    await first.exited;
  }, 45_000);
});
