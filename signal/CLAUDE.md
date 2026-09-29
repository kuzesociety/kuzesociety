# SIGNAL — working on the bot from inside

You are running on the owner's computer, in the folder of a running SIGNAL bot (on Windows
usually `C:\SIGNAL`). SIGNAL watches every pump.fun coin, records each one at fixed moments as a
would-be trade (every take-profit / stop / time-limit combination, after all costs), and learns
from those recordings. Your job: find a rule that makes money after every cost **on data it
never saw** — or show clearly that there is none yet — and get it traded automatically, in
paper, by the bot's own Lab and autopilot. Work in rounds, keep a journal, report plainly.

## Never

- **Never touch real money.** Do not switch the bot to live, and never open, print, copy or send
  `data/config.json`, `data/secret.json`, `.env` or anything holding a key, token or wallet.
  Going live is the owner's decision alone, made in the dashboard.
- **Never loosen the proof to get a result.** A rule counts only on data its search never saw,
  with the bound corrected for how many rules were tried, evidence counted per market hour, a
  clean luck check (the same search on shuffled outcomes finds nothing), and a recording counted
  only as far as it was actually watched. `docs/RESEARCH.md` explains each of these and what went
  wrong without them. "Nothing works yet" is a valid answer; the best of many rules tried on the
  same data is not a find.
- **Never stop or break the running bot, delete its data, or edit its code here.** `/update`
  overwrites this folder's code (never `data/`, `node_modules/` or `.env`). Your own scripts go
  in `work/`, which updates never touch.

## Where things are

- `data/samples/*.jsonl` — the recordings, one JSON line each (`Sample` in `src/core/outcomes.ts`):
  entry kind and tag (`x70` = first time the score reached 70, `mig300` = 5 min after graduating,
  `age45`, `prog50`…), the coin's facts at entry (`x`, `f`), and every exit's net return (`grid`,
  `gridT`, `path`). `blind`/`blindBy` say when the coin stopped being watched.
- `data/state.json` — settings, open and closed trades. `data/edges.json` — the latest search.
  `data/autopilot.json` — the autopilot's state and decisions. `data/lab.json` — the Lab.
- `src/core/` — the logic: `edges.ts` (the search and `measureRule`), `lab.ts`, `autopilot.ts`,
  `outcomes.ts` (how recordings are made), `engine.ts` (how the bot trades).

## Start

1. `node dist\research.mjs diagnose --data data` (on Mac/Linux `node dist/research.mjs …`): one
   page with the data's health, every entry on all data (flattering, not proof), the last search
   and its closest tries, the rule in use, the autopilot's decisions and the checks.
2. `npm ci` once, so the tests and `esbuild` are available.
3. Read `docs/RESEARCH.md` sections 6–8 before drawing conclusions.

## Each round (for example after each 2-hourly search)

1. Diagnose again; write in `work/JOURNAL.md` what changed since the last round.
2. Form ideas from the data: which entries, coin facts and exits come closest, where the
   recordings are thin, what the bot cannot see yet.
3. Test them with the bot's own counting: write TypeScript in `work/` that imports from
   `../src/core/…` (`recordedRows`, `measureRule`, `exitReturn`, `findEdges`), bundle it with
   `npx esbuild work/x.ts --bundle --platform=node --format=esm --outfile=work/x.mjs` and run
   `node work/x.mjs`. Keep a count of every rule you look at: a rule picked out of N needs the
   bound corrected for N (see `holdoutStats` in `edges.ts`).
4. Hand anything that survives to the Lab: one rule per line in `data/lab-inbox.txt`, in the
   Lab's format (`LAB_FORMAT` in `src/core/lab.ts`), e.g. `mig300 top10<=25% smart>=1 tp100 sl30 hold30`.
   The bot takes the file at its next Lab run, tests each rule only on coins that come after it,
   and logs what it did in `data/lab-inbox.done.txt`. A proven rule reaches the autopilot, which
   trades it in paper if it beats the rule in use.
5. Improvements to the bot itself (a new fact to record, a better entry, a bug) go through the
   repository, not this folder: in a clone of `https://github.com/kuzesociety/kuzesociety`,
   branch `claude/signal-meme-trading-bot-o142hw`, folder `signal/`: change, `npx tsc --noEmit`,
   `npx vitest run`, `npm run build`, commit, push; then the owner sends `/update`. Ask the owner
   before the first push, and never push anything that loosens the proof.
6. Report: a few lines in `work/JOURNAL.md` and to the owner — how many rules were tried, what
   held up, what the bot trades and how its own trades are doing. Plain words, no promises: on
   pump.fun most coins die and every trade pays fees both ways, so a real edge is small and rare.
