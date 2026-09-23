/** SIGNAL research CLI: the commands are listed in USAGE. */
import { findEdges } from "../core/edges.js";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { trainAndSelect } from "../core/learn.js";
import { priorModel, type ModelSpec, validateModel } from "../core/model.js";
import { buildReport } from "../core/report.js";
import { DEFAULT_SETTINGS, sanitizeSettings } from "../core/settings.js";
import { silentLogger } from "../core/util.js";
import { MarketSim } from "../sim/market.js";
import { DataStore, readRecording } from "../node/store.js";
import { replay } from "./replay.js";
import { pipelineSelfTest } from "./selftest.js";

const USAGE = `SIGNAL research CLI

  node dist/research.mjs report   [--data ./data] [--days 14]
  node dist/research.mjs replay   [--data ./data] [--score 75] [--tp 100] [--sl 50] [--scoreonly] [--latency 1500]
  node dist/research.mjs sweep    [--data ./data] [--scores 65,75,85] [--tps 50,100,200] [--sls 30,50]
  node dist/research.mjs train    [--data ./data] [--days 14] [--adopt]
  node dist/research.mjs edges    [--data ./data] [--days 30] [--placebo 5]   (searches for rules that made money on their own)
  node dist/research.mjs sim      [--hours 6] [--out ./simdata] [--predictability 0.7] [--seed 1]
  node dist/research.mjs selftest            (proves the learning pipeline on known worlds)
`;

function args(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) continue;
    const k = a.slice(2);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) out[k] = true;
    else {
      out[k] = v;
      i++;
    }
  }
  return out;
}

const pct = (x: number) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : "—");

async function* recorded(dataDir: string, from?: string, to?: string) {
  const store = new DataStore(dataDir, silentLogger);
  const files = store
    .recordFiles()
    .filter((f) => {
      const name = f.split(/[\\/]/).pop()!.slice(0, 13);
      return (!from || name >= from) && (!to || name <= to);
    });
  store.close();
  for (const f of files) yield* readRecording(f);
}

function loadModel(path?: string | boolean): ModelSpec | undefined {
  if (typeof path !== "string") return undefined;
  const m = JSON.parse(readFileSync(path, "utf8"));
  if (!validateModel(m)) throw new Error("invalid model file");
  return m;
}

async function main() {
  const [cmd = "help", ...rest] = process.argv.slice(2);
  const a = args(rest);
  const data = String(a.data ?? "./data");
  switch (cmd) {
    case "report": {
      const store = new DataStore(data, silentLogger);
      const samples = store.loadSamples(Number(a.days ?? 14));
      store.close();
      const settings = sanitizeSettings({ minScore: Number(a.score ?? 75), tpPct: Number(a.tp ?? 100), slPct: Number(a.sl ?? 50) });
      const r = buildReport(samples, settings, store.loadModel() ?? priorModel(), [], Date.now());
      console.log(`Samples ${r.samples} (${r.checkpoints} checkpoints, ${r.signals} signals) over ${r.spanHours.toFixed(1)} h`);
      console.log(`TP ${r.settings.tpPct}% / SL ${r.settings.slPct}% — break-even win rate ≈ ${pct(r.breakEven)}\n`);
      console.log("score    n      win%    avg return (95% range)        median peak");
      for (const b of r.buckets) console.log(`${String(b.lo).padStart(3)}-${String(b.hi).padEnd(3)} ${String(b.n).padStart(6)}  ${pct(b.winRate).padStart(7)}   ${pct(b.avgRet).padStart(7)} (${pct(b.retLo)} … ${pct(b.retHi)})   ${Number.isFinite(b.medMaxMult) ? b.medMaxMult.toFixed(2) + "×" : "—"}`);
      console.log(`\nGo-live gate: ${r.gate.verdict} — ${r.gate.detail}`);
      break;
    }
    case "replay": {
      const settings = { ...DEFAULT_SETTINGS, minScore: Number(a.score ?? 75), tpPct: Number(a.tp ?? 100), slPct: Number(a.sl ?? 50), scoreOnly: !!a.scoreonly, maxOpen: Number(a.maxopen ?? 5), positionSol: Number(a.size ?? 0.1) };
      const src = a.sim ? new MarketSim({ durationMs: Number(a.hours ?? 3) * 3_600_000, seed: Number(a.seed ?? 1), predictability: Number(a.predictability ?? 0.7) }).run() : recorded(data, a.from as string, a.to as string);
      const r = await replay(src, { settings, model: loadModel(a.model), latencyMs: Number(a.latency ?? 1500) });
      console.log(JSON.stringify({ ...r, samples: undefined }, null, 1));
      break;
    }
    case "sweep": {
      const scores = String(a.scores ?? "65,75,85").split(",").map(Number);
      const tps = String(a.tps ?? "50,100,200").split(",").map(Number);
      const sls = String(a.sls ?? "30,50").split(",").map(Number);
      console.log("score  tp   sl   trades  win%    avg%     pnl SOL   maxDD");
      for (const s of scores)
        for (const tp of tps)
          for (const sl of sls) {
            const src = a.sim ? new MarketSim({ durationMs: Number(a.hours ?? 3) * 3_600_000, seed: Number(a.seed ?? 1) }).run() : recorded(data, a.from as string, a.to as string);
            const r = await replay(src, { settings: { minScore: s, tpPct: tp, slPct: sl, scoreOnly: !!a.scoreonly, maxOpen: Number(a.maxopen ?? 5) }, model: loadModel(a.model), latencyMs: Number(a.latency ?? 1500) });
            console.log(`${String(s).padStart(5)} ${String(tp).padStart(4)} ${String(sl).padStart(4)} ${String(r.paper.trades).padStart(7)} ${pct(r.paper.winRate).padStart(7)} ${(r.paper.avgPct ?? 0).toFixed(1).padStart(7)} ${r.paper.pnlSol.toFixed(3).padStart(9)} ${r.paper.maxDrawdownSol.toFixed(3).padStart(7)}`);
          }
      break;
    }
    case "train": {
      const store = new DataStore(data, silentLogger);
      const samples = store.loadSamples(Number(a.days ?? 14));
      const current = store.loadModel() ?? priorModel();
      const rows = samples.filter((s) => s.kind === "checkpoint").map((s) => ({ ts: s.ts, stage: s.stage, x: s.x, y: s.y }));
      const { model, reports } = trainAndSelect(current, rows);
      for (const r of reports) console.log(`${r.stage}: ${r.adopted ? "ADOPT" : "keep"} — ${r.reason}; AUC ${r.current.auc?.toFixed(3)} → ${r.candidate.auc?.toFixed(3)}, log-loss ${r.current.logLoss?.toFixed(4)} → ${r.candidate.logLoss?.toFixed(4)} (train ${r.trainRows}, validate ${r.valRows})`);
      if (a.adopt && reports.some((r) => r.adopted)) {
        store.saveModel(model);
        console.log(`saved ${model.version} to ${join(data, "models/current.json")} — restart the server to use it`);
      }
      store.close();
      break;
    }
    case "sim": {
      const out = String(a.out ?? "./simdata");
      mkdirSync(out, { recursive: true });
      const store = new DataStore(out, silentLogger);
      const sim = new MarketSim({ durationMs: Number(a.hours ?? 6) * 3_600_000, seed: Number(a.seed ?? 1), predictability: Number(a.predictability ?? 0.7) });
      let n = 0;
      for (const ev of sim.run()) {
        store.record(ev, ev.ts);
        n++;
      }
      store.close();
      console.log(`wrote ${n} simulated events to ${out}/record (SYNTHETIC — for testing the pipeline only)`);
      break;
    }
    case "edges": {
      const store = new DataStore(data, silentLogger);
      const samples = store.loadSamples(Number(a.days ?? 30));
      store.close();
      const r = findEdges(samples, { placeboRuns: Number(a.placebo ?? 5) });
      console.log(r.note);
      if (r.status === "ok") {
        console.log(`\n${r.samples.toLocaleString("en-US")} would-be trades over ${r.hours.toFixed(1)} h: searched the first ${r.discoveryHours.toFixed(1)} h, checked on the last ${r.holdoutHours.toFixed(1)} h`);
        console.log(`${r.tested.toLocaleString("en-US")} rules scored, ${r.candidates} re-tested, ${r.survivors.length} held up. Placebo (shuffled data): ${r.placebo.avgSurvivors.toFixed(2)} per run, max ${r.placebo.maxSurvivors}\n`);
        for (const s of r.survivors)
          console.log(`✔ ${s.text}\n   newest data ${pct(s.holdout.mean)} per trade (worst case ${pct(s.holdout.lo)}, ${s.holdout.n} trades, ${pct(s.holdout.winRate)} winners) · search data ${pct(s.discovery.mean)} · every coin at the same entry: ${pct(s.baseline)} · ${s.tradesPerDay.toFixed(0)} coins/day`);
        for (const s of r.failed) console.log(`✘ ${s.text}: ${pct(s.discovery.mean)} in the search data, ${pct(s.holdout.mean)} on the newest data`);
      }
      break;
    }
    case "selftest": {
      const res = await pipelineSelfTest({ hours: Number(a.hours ?? 4), log: (m) => console.log(m) });
      console.log(JSON.stringify(res, null, 1));
      break;
    }
    default:
      console.log(USAGE);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
