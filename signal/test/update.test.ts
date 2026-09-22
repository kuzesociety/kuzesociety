import { spawn } from "node:child_process";
import { copyFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { silentLogger } from "../src/core/util.js";
import { Updater, botFiles, crc32, installFiles, readVersion, unzip } from "../src/node/update.js";

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

const TOP = "kuzesociety-claude-signal-meme-trading-bot-o142hw/";

function release(version: string, extra: ZipFile[] = []): Buffer {
  return makeZip([
    { name: TOP },
    { name: `${TOP}Dockerfile`, data: "FROM node" },
    { name: `${TOP}signal/` },
    { name: `${TOP}signal/dist/engine.mjs`, data: `// bot ${version}` },
    { name: `${TOP}signal/dist/version.json`, data: JSON.stringify({ version }) },
    { name: `${TOP}signal/package.json`, data: "{}" },
    { name: `${TOP}signal/start-windows.bat`, data: "@echo off\r\n" },
    { name: `${TOP}signal/start-mac.command`, data: "#!/bin/bash\n", mode: 0o100755 },
    { name: `${TOP}signal/docs/SETUP-WINDOWS.md`, data: `guide ${version}` },
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
          { name: `${TOP}signal/data/config.json`, data: "{}" },
          { name: `${TOP}signal/.env`, data: "X=1" },
          { name: `${TOP}signal/node_modules/ws/index.js`, data: "" },
          { name: `${TOP}signal/../evil.txt`, data: "no" },
        ]),
      ),
    );
    expect([...files.keys()].sort()).toEqual(["dist/engine.mjs", "dist/version.json", "docs/SETUP-WINDOWS.md", "package.json", "start-mac.command", "start-windows.bat"]);
    expect(files.get("start-mac.command")!.mode).toBe(0o755);
    expect(files.get("dist/engine.mjs")!.data.toString()).toBe("// bot bbbbbbbbbbbb");
  });

  it("refuses damaged or incomplete downloads", () => {
    expect(() => unzip(Buffer.from("<html>rate limited</html>"))).toThrow(/not a zip/);
    const good = release("bbbbbbbbbbbb");
    expect(() => unzip(good.subarray(0, good.length - 40))).toThrow();
    expect(() => unzip(makeZip([{ name: `${TOP}signal/dist/engine.mjs`, data: "x", badCrc: true }]))).toThrow(/damaged/);
    expect(() => botFiles(unzip(makeZip([{ name: `${TOP}signal/dist/engine.mjs`, data: "x" }])))).toThrow(/missing/);
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
      { name: `${TOP}signal/dist/engine.mjs`, data: engine },
      { name: `${TOP}signal/dist/version.json`, data: JSON.stringify({ version: "cccccccccccc" }) },
      { name: `${TOP}signal/package.json`, data: readFileSync(join(ROOT, "package.json"), "utf8") },
      { name: `${TOP}signal/start-windows.bat`, data: readFileSync(join(ROOT, "start-windows.bat"), "utf8") },
      { name: `${TOP}signal/docs/NEW.md`, data: "new" },
      { name: `${TOP}signal/data/config.json`, data: "{}" },
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
      },
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
      const local = { "x-signal": "1", "content-type": "application/json" }; // same computer: no token needed
      const st = await (await fetch(`http://127.0.0.1:${port}/api/setup`)).json();
      expect(st.update).toMatchObject({ can: true, available: false });
      const check = await (await fetch(`http://127.0.0.1:${port}/api/setup/update-check`, { method: "POST", headers: local, body: "{}" })).json();
      expect(check.update).toMatchObject({ available: true, latest: "cccccccccccc" });
      const res = await fetch(`http://127.0.0.1:${port}/api/setup/update`, { method: "POST", headers: local, body: "{}" });
      expect(await res.json()).toMatchObject({ ok: true, version: "cccccccccccc", restarting: true });
      expect(await exited).toBe(75);
      expect(readVersion(dir)).toBe("cccccccccccc");
      expect(readFileSync(join(dir, "docs/NEW.md"), "utf8")).toBe("new");
      expect(readFileSync(join(dir, "data/config.json"), "utf8")).toBe('{"TELEGRAM_CHAT_ID":"none"}');
      expect(existsSync(join(dir, "data/state.json"))).toBe(true);
    } finally {
      proc.kill("SIGKILL");
    }
  }, 60_000);
});
