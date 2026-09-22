// Builds:
//   dist/dashboard.html  — the dashboard as ONE self-contained HTML file (inline JS/CSS)
//   dist/engine.mjs      — the server, bundled into a single file (dashboard embedded)
//   dist/research.mjs    — the research / replay command line tool
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
mkdirSync(dist, { recursive: true });

async function bundleWeb(entry, htmlTemplate, out, define = {}) {
  const res = await build({
    entryPoints: [join(root, entry)],
    bundle: true,
    minify: true,
    format: "iife",
    target: ["es2020", "safari15"],
    write: false,
    jsx: "automatic",
    jsxImportSource: "preact",
    legalComments: "none",
    define: { "process.env.NODE_ENV": '"production"', ...define },
    loader: { ".css": "text" },
  });
  const js = res.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  const tpl = readFileSync(join(root, htmlTemplate), "utf8");
  const html = tpl.replace("/*__APP_JS__*/", () => js);
  writeFileSync(join(dist, out), html);
  return html;
}

const dashboard = await bundleWeb("src/web/main.tsx", "src/web/index.html", "dashboard.html");
console.log(`dist/dashboard.html  ${(dashboard.length / 1024).toFixed(0)} KB`);

const banner = "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);";
await build({
  entryPoints: [join(root, "src/node/main.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: join(dist, "engine.mjs"),
  banner: { js: banner },
  define: { __DASHBOARD_HTML__: JSON.stringify(dashboard), "process.env.SIGNAL_FORCE_MAIN": '"1"' },
  external: ["bufferutil", "utf-8-validate"],
  legalComments: "none",
  logLevel: "warning",
});
console.log("dist/engine.mjs      server bundle");

await build({
  entryPoints: [join(root, "src/research/cli.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: join(dist, "research.mjs"),
  banner: { js: banner },
  external: ["bufferutil", "utf-8-validate"],
  legalComments: "none",
  logLevel: "warning",
});
console.log("dist/research.mjs    research CLI");

if (existsSync(join(root, "src/companion/main.tsx"))) {
  const companion = await bundleWeb("src/companion/main.tsx", "src/companion/index.html", "companion.html");
  console.log(`dist/companion.html  ${(companion.length / 1024).toFixed(0)} KB`);
}
