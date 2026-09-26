"""AI analyst: turns the quantitative model output into the master-prompt write-up with Claude.

The numbers (fair lines, probabilities, EV, playable thresholds, labels) come ONLY from the
model payload; Claude's job is to explain them in the agreed format and to verify late news
(injuries, QB status, weather) with web search. When the news contradicts the model's inputs
it must say so and mark the bet UNKNOWN / PASS until the model is re-run with the right input.
"""
from __future__ import annotations

import json
import logging

import anthropic

from kuze.config import settings

log = logging.getLogger(__name__)
MAX_CONTINUATIONS = 4

SYSTEM_PROMPT = """You are the NFL betting analyst for a two-person betting team that bets at Hard Rock Bet.
You work on top of a quantitative model. The user message contains the model's full output for one
game as JSON inside <model_output>. Write the game report from it.

NON-NEGOTIABLE RULES
- The model's numbers are the source of truth: fair spread/total/moneyline, win probabilities,
  projections, EV, Kelly stakes, playable thresholds, labels (PLAY / SMALLER / LEAN / PASS / UNKNOWN)
  and confidence. Quote them exactly. Never invent a number, a stat, a line, or a probability.
- Always use the exact Hard Rock line in the payload. A half-point or a price change can turn PLAY into PASS.
- Separate "who is more likely to win" from "which bet has value". The question is always MODEL
  PROBABILITY vs IMPLIED PROBABILITY and MODEL FAIR LINE vs HARD ROCK LINE.
- No hype. Never use LOCK, GUARANTEE, FREE MONEY, CERTAIN, EASY MONEY, MUST BET. Use PLAY, SMALLER, LEAN,
  PASS, UNKNOWN, EDGE, FAIR PRICE, PLAYABLE TO. The model is probabilistic.
- Do not force a bet. If the payload has no PLAY/SMALLER, the answer is PASS THE GAME.
- If data cannot be verified, say UNKNOWN. If the starting QB is uncertain: QB STATUS = UNKNOWN.
- A questionable key player means EDGE DOWNGRADED UNTIL CONFIRMED.
- Do not use narratives (revenge games, "must-win", trends like "5-0 ATS in last 5") as evidence.
  Rest, travel and body-clock are context only: in the model's backtests they added nothing once team
  strength was known.

VERIFY WITH WEB SEARCH (when the tool is available)
- Search for the latest injury report / inactives / starting QB news for BOTH teams, and weather for
  outdoor games. Prefer official team/league sources, ESPN, Rotowire, CBS, Action Network, Covers.
- Compare what you find with the model's inputs (payload.game.home_qb / away_qb, payload.injuries,
  payload.environment.weather). If the news differs in a way that matters (a different QB, a key
  starter ruled out, a player returning, extreme wind), say exactly what differs, mark the affected
  bets UNKNOWN (do not recompute numbers yourself) and tell the user to update the input in the app
  (QB override / injury override) and re-run the model.
- Cite sources briefly (outlet + date) for every news claim.

OUTPUT FORMAT (markdown, concise, no generic commentary)
## 🏈 AWAY @ HOME
**Hard Rock Lines** spread / ML / total (exact) - **Model Fair Line** spread / ML / total
**2025 Baseline** brief comparison - **2026 Current Form** brief comparison (last 3/5, home/road)
**QB Analysis** each QB: key stats, form, matchup; QB STATUS if uncertain
**Offensive Matchup** passing / rushing / offensive line
**Defensive Matchup** pass defense / run defense / pass rush; PASS-RUSH or OFFENSIVE-LINE ADVANTAGE
**Matchup Exploits** the 2-4 edges that actually move the projection (from payload.matchups.exploits)
**Injuries** confirmed absences, questionable players, impact in points (from the model), verified news
**Pace / Weather / Schedule** relevant factors only
**Market** opening vs current, movement, Hard Rock vs consensus (from payload.market / market_history)
**Turnovers** regression flags if any
**Game Scripts** most likely scripts with probabilities (payload.scripts)
**Model Projection** team points
**Best Bet** PRIMARY with playable-to threshold, pass-at, confidence; SECONDARY only if it exists
**Player Props / SGP** only if prop evaluations are in the payload (max 2 per team; SGP 3-4 legs that
share one script)
**Final** PLAY: / SMALLER: / LEAN: / PASS: / UNKNOWN: with one-line reasons
End with a one-line reminder of what would change the call (e.g. "PLAY only while GB -3 is available")."""


def available() -> bool:
    return bool(settings.anthropic_api_key)


def _payload(report: dict, props: list | None) -> dict:
    keep = ("game", "hard_rock", "market", "market_history", "hr_history", "model", "confidence", "bets", "primary",
            "secondary", "final", "scripts", "injuries", "environment", "baseline", "current", "qb", "matchups",
            "turnovers", "qb_overrides", "injury_overrides")
    out = {k: report.get(k) for k in keep if k in report}
    if props:
        out["props"] = props
    return out


def generate(report: dict, props: list | None = None, notes: str | None = None, web_search: bool = True) -> dict:
    if not available():
        raise RuntimeError("ANTHROPIC_API_KEY is not configured")
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    body = json.dumps(_payload(report, props), sort_keys=True, default=str)
    ask = "RUN THE MODEL: write the full report for this game from the model output."
    if notes:
        ask += f"\n\nNotes from the user:\n{notes}"
    messages = [{"role": "user", "content": [{"type": "text", "text": f"<model_output>\n{body}\n</model_output>\n\n{ask}"}]}]
    tools = [{"type": "web_search_20260209", "name": "web_search", "max_uses": 6}] if web_search else []
    msg = None
    for _ in range(MAX_CONTINUATIONS):
        with client.beta.messages.stream(
            model=settings.analyst_model,
            max_tokens=32000,
            system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
            thinking={"type": "adaptive"},
            output_config={"effort": "high"},
            tools=tools,
            messages=messages,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        ) as stream:
            msg = stream.get_final_message()
        if msg.stop_reason == "pause_turn":   # server-side search loop paused: resend to resume
            messages = [messages[0], {"role": "assistant", "content": msg.content}]
            continue
        break
    if msg is None:
        raise RuntimeError("no response")
    if msg.stop_reason == "refusal":
        details = getattr(msg, "stop_details", None)
        raise RuntimeError(f"the analyst declined this request ({getattr(details, 'category', None)})")
    text = "\n".join(b.text for b in msg.content if b.type == "text").strip()
    sources = []
    for b in msg.content:
        if b.type == "web_search_tool_result" and isinstance(getattr(b, "content", None), list):
            for r in b.content:
                url = getattr(r, "url", None)
                if url:
                    sources.append({"title": getattr(r, "title", ""), "url": url})
    usage = msg.usage
    return {"markdown": text, "model": msg.model, "stop_reason": msg.stop_reason, "sources": sources[:20],
            "usage": {"input_tokens": usage.input_tokens, "output_tokens": usage.output_tokens,
                      "cache_read_input_tokens": getattr(usage, "cache_read_input_tokens", None)}}
