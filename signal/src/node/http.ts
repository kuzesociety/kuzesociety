/** fetch with timeout + JSON parsing that never throws (returns null on failure). */
export async function getJson<T = unknown>(url: string, opts: { timeoutMs?: number; headers?: Record<string, string> } = {}): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 8_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json", ...(opts.headers ?? {}) } });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > 20_000_000) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function postJson<T = unknown>(url: string, body: unknown, opts: { timeoutMs?: number; headers?: Record<string, string> } = {}): Promise<{ ok: boolean; status: number; json: T | null; text: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 10_000);
  try {
    const res = await fetch(url, { method: "POST", signal: ctrl.signal, headers: { "content-type": "application/json", ...(opts.headers ?? {}) }, body: JSON.stringify(body) });
    const text = await res.text();
    let json: T | null = null;
    try {
      json = JSON.parse(text) as T;
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, json, text: text.slice(0, 2000) };
  } catch (e) {
    return { ok: false, status: 0, json: null, text: String(e) };
  } finally {
    clearTimeout(timer);
  }
}

/** Token bucket rate limiter: `take()` resolves when a request may be made. */
export class RateLimiter {
  private tokens: number;
  private last = Date.now();
  constructor(
    private perMinute: number,
    private burst = Math.max(1, Math.floor(perMinute / 6)),
  ) {
    this.tokens = this.burst;
  }
  tryTake(): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) * this.perMinute) / 60_000);
    this.last = now;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }
}
