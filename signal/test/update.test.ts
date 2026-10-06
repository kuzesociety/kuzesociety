import { spawn } from "node:child_process";
import { copyFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { momentTag } from "../src/core/settings.js";
import { silentLogger } from "../src/core/util.js";
import {
  Updater,
  backupFiles,
  badVersions,
  bootCheck,
  botFiles,
  crc32,
  guardStartup,
  installFiles,
  readVersion,
  restoreBackup,
  takeRollbackNote,
  unzip,
} from "../src/node/update.js";
import { Scenario, key } from "./helpers.js";

interface ZipFile {
  name: string;
  data?: string;
  mode?: number;
  badCrc?: boolean;
}

/** A minimal zip writer, laid out like GitHub's branch downloads. */
function makeZip(files: ZipFile[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name);
    const dir = f.name.endsWith("/");
    const raw = Buffer.from(dir ? "" : (f.data ?? ""));
    const comp = dir ? raw : deflateRawSync(raw);
    const method = dir ? 0 : 8;
    const crc = (crc32(raw) ^ (f.badCrc ? 1 : 0)) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(0x0314, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(comp.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE((((f.mode ?? (dir ? 0o40755 : 0o100644)) & 0xffff) << 16) >>> 0, 38);
    cd.writeUInt32LE(offset, 42);
    parts.push(local, name, comp);
    central.push(cd, name);
    offset += 30 + name.length + comp.length;
  }
  const dirBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dirBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dirBuf, end]);
}

const TOP = "signal-main/";

function release(version: string, extra: ZipFile[] = []): Buffer {
  return makeZip([
    { name: TOP },
    { name: `${TOP}dist/engine.mjs`, data: `// bot ${version}` },
    { name: `${TOP}dist/version.json`, data: JSON.stringify({ version }) },
    { name: `${TOP}package.json`, data: "{}" },
    { name: `${TOP}start-windows.bat`, data: "@echo off\r\n" },
    { name: `${TOP}start-mac.command`, data: "#!/bin/bash\n", mode: 0o100755 },
    { name: `${TOP}docs/SETUP-WINDOWS.md`, data: `guide ${version}` },
    ...extra,
  ]);
}

let dirs: string[] = [];
let server: Server | null = null;
afterEach(() => {
  server?.close();
  server = null;
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

/** An install as the user has it: an old bot plus their own data, keys and .env. */
function oldInstall(version = "aaaaaaaaaaaa") {
  const dir = mkdtempSync(join(tmpdir(), "signal-update-"));
  dirs.push(dir);
  const put = (rel: string, data: string) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), data);
  };
  put("dist/engine.mjs", "// bot old");
  put("dist/version.json", JSON.stringify({ version }));
  put("package.json", "{}");
  put("start-windows.bat", "@echo off\r\n");
  put("data/config.json", '{"RPC_URL":"https://secret"}');
  put(".env", "DASHBOARD_TOKEN=mine");
  return dir;
}

async function serve(routes: Record<string, () => { status: number; body: Buffer | string }>) {
  const hits: string[] = [];
  server = createServer((req, res) => {
    hits.push(req.url ?? "");
    const r = routes[req.url ?? ""]?.() ?? { status: 404, body: "not found" };
    res.writeHead(r.status);
    res.end(r.body);
  });
  await new Promise<void>((ok) => server!.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  return { base, hits };
}

describe("updates from the ZIP download", () => {
  it("reads a GitHub-style archive and keeps only the bot's own files", () => {
    const files = botFiles(
      unzip(
        release("bbbbbbbbbbbb", [
          { name: `${TOP}data/config.json`, data: "{}" },
          { name: `${TOP}.env`, data: "X=1" },
          { name: `${TOP}node_modules/ws/index.js`, data: "" },
          { name: `${TOP}../evil.txt`, data: "no" },
        ]),
      ),
    );
    expect([...files.keys()].sort()).toEqual(["dist/engine.mjs", "dist/version.json", "docs/SETUP-WINDOWS.md", "package.json", "start-mac.command", "start-windows.bat"]);
    expect(files.get("start-mac.command")!.mode).toBe(0o755);
    expect(files.get("dist/engine.mjs")!.data.toString()).toBe("// bot bbbbbbbbbbbb");
  });

  it("still reads a download from where the bot lived before, in a signal/ folder next to other projects", () => {
    const OLD = "kuzesociety-claude-signal-meme-trading-bot-o142hw/";
    const files = botFiles(
      unzip(
        makeZip([
          { name: OLD },
          { name: `${OLD}Dockerfile`, data: "FROM node" },
          { name: `${OLD}metatrader/README.md`, data: "another project" },
          { name: `${OLD}signal/dist/engine.mjs`, data: "// bot" },
          { name: `${OLD}signal/dist/version.json`, data: JSON.stringify({ version: "bbbbbbbbbbbb" }) },
          { name: `${OLD}signal/package.json`, data: "{}" },
          { name: `${OLD}signal/start-windows.bat`, data: "@echo off\r\n" },
        ]),
      ),
    );
    expect([...files.keys()].sort()).toEqual(["dist/engine.mjs", "dist/version.json", "package.json", "start-windows.bat"]);
  });

  it("refuses damaged or incomplete downloads", () => {
    expect(() => unzip(Buffer.from("<html>rate limited</html>"))).toThrow(/not a zip/);
    const good = release("bbbbbbbbbbbb");
    expect(() => unzip(good.subarray(0, good.length - 40))).toThrow();
    expect(() => unzip(makeZip([{ name: `${TOP}dist/engine.mjs`, data: "x", badCrc: true }]))).toThrow(/damaged/);
    expect(() => botFiles(unzip(makeZip([{ name: `${TOP}dist/engine.mjs`, data: "x" }])))).toThrow(/missing/);
    expect(() => botFiles(unzip(makeZip([{ name: `${TOP}README.md`, data: "x" }])))).toThrow(/does not contain the bot/);
  });

  it("installs over the old files and leaves data, keys and .env alone", async () => {
    const dir = oldInstall();
    const changed = await installFiles(dir, botFiles(unzip(release("bbbbbbbbbbbb"))));
    expect(changed).toBe(4); // package.json and start-windows.bat were already the same
    expect(readFileSync(join(dir, "dist/engine.mjs"), "utf8")).toBe("// bot bbbbbbbbbbbb");
    expect(readVersion(dir)).toBe("bbbbbbbbbbbb");
    expect(readFileSync(join(dir, "data/config.json"), "utf8")).toBe('{"RPC_URL":"https://secret"}');
    expect(readFileSync(join(dir, ".env"), "utf8")).toBe("DASHBOARD_TOKEN=mine");
    expect(existsSync(join(dir, "dist/engine.mjs.updating"))).toBe(false);
    if (process.platform !== "win32") expect(statSync(join(dir, "start-mac.command")).mode & 0o111).not.toBe(0);
    expect(await installFiles(dir, botFiles(unzip(release("bbbbbbbbbbbb"))))).toBe(0);
  });

  it("finds a new version, announces it once, installs it and restarts", async () => {
    const dir = oldInstall();
    const zip = release("bbbbbbbbbbbb");
    const { base } = await serve({
      "/version.json": () => ({ status: 200, body: JSON.stringify({ version: "bbbbbbbbbbbb" }) }),
      "/bot.zip": () => ({ status: 200, body: zip }),
    });
    const announced: string[] = [];
    let restarts = 0;
    const make = () =>
      new Updater({
        installDir: dir,
        selfUpdate: true,
        log: silentLogger,
        restart: () => ++restarts > 0,
        onAvailable: (v) => announced.push(v),
        notedFile: join(dir, "data/update-noted"),
        zipUrl: `${base}/bot.zip`,
        versionUrl: `${base}/version.json`,
      });
    const u = make();
    expect(u.status()).toMatchObject({ current: "aaaaaaaaaaaa", can: true, available: false, state: "idle" });
    expect(await u.check()).toMatchObject({ latest: "bbbbbbbbbbbb", available: true });
    expect(announced).toEqual(["bbbbbbbbbbbb"]);
    await make().check(); // after a restart: already announced
    expect(announced).toHaveLength(1);

    const r = await u.apply();
    expect(r).toMatchObject({ ok: true, upToDate: false, version: "bbbbbbbbbbbb", restarting: true });
    expect(restarts).toBe(1);
    expect(u.status().state).toBe("restarting");
    expect(readFileSync(join(dir, "dist/engine.mjs"), "utf8")).toBe("// bot bbbbbbbbbbbb");
    expect(readFileSync(join(dir, "data/config.json"), "utf8")).toBe('{"RPC_URL":"https://secret"}');

    // the restarted bot is the new version and has nothing to do
    const after = make();
    expect(after.current).toBe("bbbbbbbbbbbb");
    expect((await after.check()).available).toBe(false);
    expect(await after.apply()).toMatchObject({ ok: true, upToDate: true, restarting: false });
    expect(restarts).toBe(1);
  });

  it("changes nothing when the download fails or is damaged", async () => {
    const dir = oldInstall();
    const good = release("bbbbbbbbbbbb");
    const { base } = await serve({
      "/missing.zip": () => ({ status: 404, body: "no" }),
      "/cut.zip": () => ({ status: 200, body: good.subarray(0, Math.floor(good.length / 2)) }),
    });
    for (const path of ["/missing.zip", "/cut.zip"]) {
      const u = new Updater({ installDir: dir, selfUpdate: true, log: silentLogger, restart: () => true, zipUrl: base + path, versionUrl: `${base}/none` });
      const r = await u.apply();
      expect(r.ok).toBe(false);
      expect(u.status()).toMatchObject({ state: "failed", error: expect.any(String) });
      expect(readFileSync(join(dir, "dist/engine.mjs"), "utf8")).toBe("// bot old");
      expect(readVersion(dir)).toBe("aaaaaaaaaaaa");
      // a failed check is quiet and leaves the state as it was
      expect((await u.check()).available).toBe(false);
    }
  });

  it("only copies started by the starter scripts update themselves, and never a git checkout", async () => {
    const dir = oldInstall();
    const plain = new Updater({ installDir: dir, selfUpdate: false, log: silentLogger, restart: () => true });
    expect(plain.can).toBe(false);
    expect(plain.status().why).toMatch(/start-windows\.bat/);
    expect(await plain.apply()).toMatchObject({ ok: false });
    mkdirSync(join(dir, ".git"));
    const git = new Updater({ installDir: dir, selfUpdate: true, log: silentLogger, restart: () => true });
    expect(git.status().why).toMatch(/git pull/);
    expect(readFileSync(join(dir, "dist/engine.mjs"), "utf8")).toBe("// bot old");
  });
});

describe("the built bot updates itself", () => {
  it("downloads, installs over its own folder, keeps data and restarts with 75", async () => {
    const ROOT = join(__dirname, "..");
    const dir = mkdtempSync(join(tmpdir(), "signal-selfupdate-"));
    dirs.push(dir);
    // a copy installed from the ZIP, with the user's own data
    mkdirSync(join(dir, "dist"));
    for (const f of ["dist/engine.mjs", "dist/version.json", "package.json", "start-windows.bat"]) copyFileSync(join(ROOT, f), join(dir, f));
    mkdirSync(join(dir, "data"));
    writeFileSync(join(dir, "data/config.json"), '{"TELEGRAM_CHAT_ID":"none"}');
    const engine = readFileSync(join(ROOT, "dist/engine.mjs"), "utf8");
    const zip = makeZip([
      { name: `${TOP}dist/engine.mjs`, data: engine },
      { name: `${TOP}dist/version.json`, data: JSON.stringify({ version: "cccccccccccc" }) },
      { name: `${TOP}package.json`, data: readFileSync(join(ROOT, "package.json"), "utf8") },
      { name: `${TOP}start-windows.bat`, data: readFileSync(join(ROOT, "start-windows.bat"), "utf8") },
      { name: `${TOP}docs/NEW.md`, data: "new" },
      { name: `${TOP}data/config.json`, data: "{}" },
    ]);
    const { base } = await serve({
      "/v": () => ({ status: 200, body: JSON.stringify({ version: "cccccccccccc" }) }),
      "/z": () => ({ status: 200, body: zip }),
    });
    const port = 20000 + Math.floor(Math.random() * 20000);
    const proc = spawn(process.execPath, [join(dir, "dist/engine.mjs")], {
      cwd: dir,
      env: {
        ...process.env,
        SIM: "1",
        DATA_DIR: join(dir, "data"),
        PORT: String(port),
        HOST: "127.0.0.1",
        LEARN_EVERY_HOURS: "0",
        SIGNAL_SUPERVISED: "1",
        SIGNAL_SELF_UPDATE: "1",
        SIGNAL_UPDATE_ZIP_URL: `${base}/z`,
        SIGNAL_UPDATE_VERSION_URL: `${base}/v`,
        AUTO_UPDATE: "0",
      },
      stdio: "ignore",
    });
    const exited = new Promise<number | null>((r) => proc.on("exit", (code) => r(code)));
    try {
      await up(port);
      const local = { "x-signal": "1", "content-type": "application/json" }; // same computer: no token needed
      const st = await (await fetch(`http://127.0.0.1:${port}/api/setup`)).json();
      expect(st.update).toMatchObject({ can: true, available: false, auto: false });
      const check = await (await fetch(`http://127.0.0.1:${port}/api/setup/update-check`, { method: "POST", headers: local, body: "{}" })).json();
      expect(check.update).toMatchObject({ available: true, latest: "cccccccccccc" });
      const res = await fetch(`http://127.0.0.1:${port}/api/setup/update`, { method: "POST", headers: local, body: "{}" });
      expect(await res.json()).toMatchObject({ ok: true, version: "cccccccccccc", restarting: true });
      expect(await exited).toBe(75);
      expect(readVersion(dir)).toBe("cccccccccccc");
      expect(readFileSync(join(dir, "docs/NEW.md"), "utf8")).toBe("new");
      expect(readFileSync(join(dir, "data/config.json"), "utf8")).toBe('{"TELEGRAM_CHAT_ID":"none"}');
      expect(existsSync(join(dir, "data/state.json"))).toBe(true);
      // on trial until it has run a while: the version before is kept
      expect(JSON.parse(readFileSync(join(dir, "data/update-pending.json"), "utf8"))).toMatchObject({ from: expect.any(String), to: "cccccccccccc", starts: 0, auto: false });
    } finally {
      proc.kill("SIGKILL");
    }
  }, 60_000);

  it("installs a new version by itself, test-starts it first, and the restarted bot keeps it on trial", async () => {
    const ROOT = join(__dirname, "..");
    const dir = mkdtempSync(join(tmpdir(), "signal-autoupdate-"));
    dirs.push(dir);
    mkdirSync(join(dir, "dist"));
    for (const f of ["dist/engine.mjs", "dist/version.json", "package.json", "start-windows.bat"]) copyFileSync(join(ROOT, f), join(dir, f));
    mkdirSync(join(dir, "data"));
    writeFileSync(join(dir, "data/config.json"), '{"TELEGRAM_CHAT_ID":"none"}');
    const before = readVersion(dir);
    const zip = makeZip([
      { name: `${TOP}dist/engine.mjs`, data: readFileSync(join(ROOT, "dist/engine.mjs"), "utf8") },
      { name: `${TOP}dist/version.json`, data: JSON.stringify({ version: "dddddddddddd" }) },
      { name: `${TOP}package.json`, data: readFileSync(join(ROOT, "package.json"), "utf8") },
      { name: `${TOP}start-windows.bat`, data: readFileSync(join(ROOT, "start-windows.bat"), "utf8") },
      { name: `${TOP}docs/NEW.md`, data: "new" },
    ]);
    const { base } = await serve({
      "/v": () => ({ status: 200, body: JSON.stringify({ version: "dddddddddddd" }) }),
      "/z": () => ({ status: 200, body: zip }),
    });
    const port = 20000 + Math.floor(Math.random() * 20000);
    const start = () => {
      const proc = spawn(process.execPath, [join(dir, "dist/engine.mjs")], {
        cwd: dir,
        env: {
          ...process.env,
          SIM: "1",
          DATA_DIR: join(dir, "data"),
          PORT: String(port),
          HOST: "127.0.0.1",
          LEARN_EVERY_HOURS: "0",
          SIGNAL_SUPERVISED: "1",
          SIGNAL_SELF_UPDATE: "1",
          SIGNAL_UPDATE_ZIP_URL: `${base}/z`,
          SIGNAL_UPDATE_VERSION_URL: `${base}/v`,
        },
        stdio: "ignore",
      });
      return { proc, exited: new Promise<number | null>((r) => proc.on("exit", (code) => r(code))) };
    };
    const first = start();
    let second: ReturnType<typeof start> | null = null;
    try {
      await up(port);
      const local = { "x-signal": "1", "content-type": "application/json" };
      expect((await (await fetch(`http://127.0.0.1:${port}/api/setup`)).json()).update).toMatchObject({ can: true, auto: true, current: before });
      // a check finds it; nothing is in the middle of an order, so it installs, test-starts and restarts
      await fetch(`http://127.0.0.1:${port}/api/setup/update-check`, { method: "POST", headers: local, body: "{}" });
      expect(await first.exited).toBe(75);
      expect(readVersion(dir)).toBe("dddddddddddd");
      expect(readFileSync(join(dir, "docs/NEW.md"), "utf8")).toBe("new");
      expect(JSON.parse(readFileSync(join(dir, "data/update-pending.json"), "utf8"))).toMatchObject({ from: before, to: "dddddddddddd", starts: 0, auto: true });
      expect(JSON.parse(readFileSync(join(dir, "data/update-backup/backup.json"), "utf8"))).toMatchObject({ from: before, to: "dddddddddddd", added: ["docs/NEW.md"] });
      expect(badVersions(join(dir, "data"))).toEqual([]);
      // the starter starts it again: the new version runs, on trial
      second = start();
      await up(port);
      expect((await (await fetch(`http://127.0.0.1:${port}/api/setup`)).json()).update).toMatchObject({ current: "dddddddddddd", available: false });
      expect(JSON.parse(readFileSync(join(dir, "data/update-pending.json"), "utf8"))).toMatchObject({ starts: 1 });
    } finally {
      first.proc.kill("SIGKILL");
      second?.proc.kill("SIGKILL");
    }
  }, 90_000);
});

/** Waits until a bot answers on `port`. */
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

const until = async (ok: () => boolean, ms = 5_000) => {
  const t0 = Date.now();
  while (!ok()) {
    if (Date.now() - t0 > ms) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe("installing by itself", () => {
  const auto = async (o: { zip?: () => { status: number; body: Buffer | string }; boots?: () => boolean; ready?: () => boolean } = {}) => {
    const dir = oldInstall();
    const zip = release("bbbbbbbbbbbb");
    const { base, hits } = await serve({
      "/version.json": () => ({ status: 200, body: JSON.stringify({ version: "bbbbbbbbbbbb" }) }),
      "/bot.zip": o.zip ?? (() => ({ status: 200, body: zip })),
    });
    const seen = { restarts: 0, waited: [] as number[], updated: [] as string[], failed: [] as [string, string, boolean][] };
    const u = new Updater({
      installDir: dir,
      selfUpdate: true,
      log: silentLogger,
      restart: () => ++seen.restarts > 0,
      zipUrl: `${base}/bot.zip`,
      versionUrl: `${base}/version.json`,
      auto: true,
      waitMs: 5,
      ready: (w) => {
        seen.waited.push(w);
        return o.ready?.() ?? true;
      },
      bootCheck: async () => o.boots?.() ?? true,
      onAutoUpdated: (from, to) => seen.updated.push(`${from}→${to}`),
      onFailed: (v, why, again) => seen.failed.push([v, why, again]),
    });
    const zips = () => hits.filter((h) => h === "/bot.zip").length;
    return { dir, u, seen, zips };
  };

  it("waits while an order is being placed or sold, then installs, keeping what it replaced", async () => {
    let busy = true;
    const { dir, u, seen } = await auto({ ready: () => !busy });
    await u.check();
    await until(() => seen.waited.length >= 3);
    expect(seen.restarts).toBe(0);
    expect(readVersion(dir)).toBe("aaaaaaaaaaaa");
    busy = false;
    await until(() => seen.updated.length > 0);
    expect(seen.updated).toEqual(["aaaaaaaaaaaa→bbbbbbbbbbbb"]);
    expect(seen.restarts).toBe(1);
    expect(seen.waited[1]).toBeGreaterThanOrEqual(0);
    expect(readVersion(dir)).toBe("bbbbbbbbbbbb");
    expect(JSON.parse(readFileSync(join(dir, "data/update-pending.json"), "utf8"))).toMatchObject({ from: "aaaaaaaaaaaa", to: "bbbbbbbbbbbb", starts: 0, auto: true });
    // the version before can be put back exactly
    expect(readFileSync(join(dir, "data/update-backup/files/dist/engine.mjs"), "utf8")).toBe("// bot old");
    expect(readFileSync(join(dir, "data/config.json"), "utf8")).toBe('{"RPC_URL":"https://secret"}');
  });

  it("puts the running version back at once when the new one does not start, says so once, and never installs it by itself again", async () => {
    const { dir, u, seen, zips } = await auto({ boots: () => false });
    await u.check();
    await until(() => seen.failed.length > 0);
    expect(seen.restarts).toBe(0);
    expect(seen.failed).toEqual([["bbbbbbbbbbbb", expect.stringMatching(/did not start .*put back/), false]]);
    expect(readFileSync(join(dir, "dist/engine.mjs"), "utf8")).toBe("// bot old");
    expect(readVersion(dir)).toBe("aaaaaaaaaaaa");
    expect(existsSync(join(dir, "docs/SETUP-WINDOWS.md"))).toBe(false); // added by the bad version: gone again
    expect(existsSync(join(dir, "start-mac.command"))).toBe(false);
    expect(readFileSync(join(dir, "data/config.json"), "utf8")).toBe('{"RPC_URL":"https://secret"}');
    expect(readFileSync(join(dir, ".env"), "utf8")).toBe("DASHBOARD_TOKEN=mine");
    expect(badVersions(join(dir, "data"))).toEqual(["bbbbbbbbbbbb"]);
    expect(existsSync(join(dir, "data/update-pending.json"))).toBe(false);
    const downloads = zips();
    await u.check();
    await new Promise((r) => setTimeout(r, 50));
    expect(zips()).toBe(downloads);
    expect(seen.failed).toHaveLength(1);
  });

  it("tries a download that failed again at the next check, and says so only once", async () => {
    const { dir, u, seen, zips } = await auto({ zip: () => ({ status: 502, body: "bad gateway" }) });
    await u.check();
    await until(() => seen.failed.length > 0);
    expect(seen.failed[0]).toEqual(["bbbbbbbbbbbb", expect.stringMatching(/502/), true]);
    await u.check();
    await until(() => zips() >= 2);
    await new Promise((r) => setTimeout(r, 50));
    expect(seen.failed).toHaveLength(1);
    expect(readVersion(dir)).toBe("aaaaaaaaaaaa");
    expect(badVersions(join(dir, "data"))).toEqual([]);
  });

  it("stays quiet when it cannot update itself", async () => {
    const dir = oldInstall();
    const u = new Updater({ installDir: dir, selfUpdate: false, log: silentLogger, restart: () => true, auto: true });
    expect(u.status()).toMatchObject({ can: false, auto: false });
  });
});

describe("a new version that keeps stopping", () => {
  /** An install just updated from aaaa to bbbb, the way apply leaves it. */
  async function updated() {
    const dir = oldInstall();
    const data = join(dir, "data");
    const files = botFiles(unzip(release("bbbbbbbbbbbb")));
    backupFiles(dir, files, join(data, "update-backup"), "aaaaaaaaaaaa", "bbbbbbbbbbbb");
    await installFiles(dir, files);
    writeFileSync(join(data, "update-pending.json"), JSON.stringify({ from: "aaaaaaaaaaaa", to: "bbbbbbbbbbbb", at: 1_000, starts: 0, auto: true }));
    return { dir, data };
  }

  it("is put back after its fourth start within half an hour, marked, and said once by the version put back", async () => {
    const { dir, data } = await updated();
    for (let i = 1; i <= 3; i++) expect(guardStartup(dir, data, 1_000 + i * 60_000)).toMatchObject({ state: "trying", starts: i, from: "aaaaaaaaaaaa", to: "bbbbbbbbbbbb", auto: true });
    expect(readVersion(dir)).toBe("bbbbbbbbbbbb");
    expect(guardStartup(dir, data, 1_000 + 4 * 60_000)).toMatchObject({ state: "rolledBack", from: "bbbbbbbbbbbb", to: "aaaaaaaaaaaa" });
    expect(readVersion(dir)).toBe("aaaaaaaaaaaa");
    expect(readFileSync(join(dir, "dist/engine.mjs"), "utf8")).toBe("// bot old");
    expect(existsSync(join(dir, "docs/SETUP-WINDOWS.md"))).toBe(false);
    expect(readFileSync(join(dir, "data/config.json"), "utf8")).toBe('{"RPC_URL":"https://secret"}');
    expect(badVersions(data)).toEqual(["bbbbbbbbbbbb"]);
    // the version put back starts normally and says what happened, once
    expect(guardStartup(dir, data, 1_000 + 5 * 60_000).state).toBe("none");
    expect(takeRollbackNote(data)).toEqual({ from: "bbbbbbbbbbbb", to: "aaaaaaaaaaaa", at: expect.any(Number) });
    expect(takeRollbackNote(data)).toBeNull();
  });

  it("is kept once it ran long enough, and restarts long after the update are not held against it", async () => {
    const { dir, data } = await updated();
    const t = guardStartup(dir, data, 2_000);
    expect(t).toMatchObject({ state: "trying", starts: 1 });
    t.confirm();
    for (let i = 0; i < 6; i++) expect(guardStartup(dir, data, 3_000 + i).state).toBe("none");
    expect(readVersion(dir)).toBe("bbbbbbbbbbbb");
    // not confirmed, but the restarts come after the first half hour
    const late = await updated();
    for (let i = 1; i <= 6; i++) expect(guardStartup(late.dir, late.data, 1_000 + 31 * 60_000 + i).state).toBe("trying");
    expect(readVersion(late.dir)).toBe("bbbbbbbbbbbb");
  });

  it("keeps the copy of the version before until all of it is back", async () => {
    const dir = oldInstall();
    const backup = join(dir, "data/update-backup");
    const files = botFiles(unzip(release("bbbbbbbbbbbb")));
    const b = backupFiles(dir, files, backup, "aaaaaaaaaaaa", "bbbbbbbbbbbb");
    expect(b.replaced.sort()).toEqual(["dist/engine.mjs", "dist/version.json"]);
    expect(b.added.sort()).toEqual(["docs/SETUP-WINDOWS.md", "start-mac.command"]);
    await installFiles(dir, files);
    expect(restoreBackup(dir, backup)).toMatchObject({ from: "aaaaaaaaaaaa", to: "bbbbbbbbbbbb" });
    expect(readVersion(dir)).toBe("aaaaaaaaaaaa");
    expect(existsSync(backup)).toBe(false);
    expect(restoreBackup(dir, backup)).toBeNull();
  });
});

describe("the test start of a new version", () => {
  const ROOT = join(__dirname, "..");
  function install(engine?: string) {
    const dir = mkdtempSync(join(tmpdir(), "signal-boot-"));
    dirs.push(dir);
    mkdirSync(join(dir, "dist"));
    if (engine === undefined) copyFileSync(join(ROOT, "dist/engine.mjs"), join(dir, "dist/engine.mjs"));
    else writeFileSync(join(dir, "dist/engine.mjs"), engine);
    writeFileSync(join(dir, "package.json"), "{}");
    mkdirSync(join(dir, "data"));
    return dir;
  }
  const snapshot = (d: string): string[] => {
    const out: string[] = [];
    const walk = (p: string) => {
      for (const name of readdirSync(p)) {
        const f = join(p, name);
        const st = statSync(f);
        if (st.isDirectory()) walk(f);
        else out.push(`${f.slice(d.length)} ${st.size} ${st.mtimeMs}`);
      }
    };
    walk(d);
    return out.sort();
  };

  it("loads the saved settings and open trades of the running bot, and writes nothing", async () => {
    const dir = install();
    // a bot with an open paper trade, saved the way the running bot saves it
    const s = new Scenario({ entryAt: momentTag("age", 30), scoreOnly: true }, { outcomeHorizonMs: 20 * 60_000 });
    const mint = key(701);
    s.create(mint, key(702));
    s.crowd(mint, 30, 0.3, 6030, 1500);
    s.advance(2_000);
    expect(s.positions().length).toBeGreaterThan(0);
    writeFileSync(join(dir, "data/state.json"), JSON.stringify(s.engine.exportState()));
    writeFileSync(join(dir, "data/autopilot.json"), JSON.stringify({ active: null, log: [] }));
    const before = snapshot(join(dir, "data"));
    expect(await bootCheck(dir, { ...process.env, DATA_DIR: join(dir, "data") })).toBe(true);
    expect(snapshot(join(dir, "data"))).toEqual(before);
  }, 60_000);

  it("fails for a version that does not load, or does not finish in time", async () => {
    expect(await bootCheck(install("throw new Error('broken build');"), { ...process.env })).toBe(false);
    expect(await bootCheck(install("setInterval(() => {}, 1000);"), { ...process.env }, 1_500)).toBe(false);
  }, 60_000);
});
