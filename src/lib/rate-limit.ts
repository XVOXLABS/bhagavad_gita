/**
 * Sliding-window limiter kept in memory. On serverless it only sees one instance's traffic,
 * so it slows down abuse rather than stopping it; production should back it with Redis.
 */
export function createLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return function allow(key: string, now = Date.now()): boolean {
    const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5_000) {
      for (const [other, times] of hits) {
        if (times.every((time) => now - time >= windowMs)) hits.delete(other);
      }
    }
    return true;
  };
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip') || 'local';
}

const globalLimits = globalThis as unknown as { __gitaLimits?: Record<string, ReturnType<typeof createLimiter>> };
globalLimits.__gitaLimits ??= {
  tts: createLimiter(30, 10 * 60_000),
  stt: createLimiter(20, 10 * 60_000),
};

export const limits = globalLimits.__gitaLimits;
