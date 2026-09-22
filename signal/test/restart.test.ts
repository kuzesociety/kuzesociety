import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

describe("restart to apply settings", () => {
  it("saves state and exits with 75 so the starter brings it back", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "signal-restart-"));
    const port = 20000 + Math.floor(Math.random() * 20000);
    const proc = spawn(process.execPath, [join(ROOT, "dist/engine.mjs")], {
      cwd: dataDir,
      env: { ...process.env, SIM: "1", DATA_DIR: dataDir, PORT: String(port), HOST: "127.0.0.1", DASHBOARD_TOKEN: "t", LEARN_EVERY_HOURS: "0", SIGNAL_SUPERVISED: "1" },
      stdio: "ignore",
    });
    const exited = new Promise<number | null>((r) => proc.on("exit", (code) => r(code)));
    try {
      const t0 = Date.now();
      for (;;) {
        try {
          if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) break;
        } catch {
          /* not up yet */
        }
        if (Date.now() - t0 > 30_000) throw new Error("server did not start");
        await new Promise((r) => setTimeout(r, 200));
      }
      const res = await fetch(`http://127.0.0.1:${port}/api/restart`, { method: "POST", headers: { "x-signal": "1", "content-type": "application/json" }, body: "{}" });
      expect(await res.json()).toMatchObject({ ok: true, restarting: true });
      expect(await exited).toBe(75);
      expect(existsSync(join(dataDir, "state.json"))).toBe(true);
    } finally {
      proc.kill("SIGKILL");
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 45_000);
});
