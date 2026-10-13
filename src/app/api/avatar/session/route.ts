import { AvatarError, avatarConfig, createAvatarSession, createDailyCap } from '@/lib/avatar';
import { elevenConfig } from '@/lib/elevenlabs';
import { safeErrorMessage } from '@/lib/llm';
import { clientKey, limits } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const globalCap = globalThis as unknown as { __gitaAvatarCap?: ReturnType<typeof createDailyCap> };

function fail(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Starts one live face session. The browser gets a short-lived token, never the Anam key. */
export async function POST(request: Request): Promise<Response> {
  const config = avatarConfig();
  if (!config.enabled || !elevenConfig().ttsEnabled) return fail(503, 'disabled');
  if (!limits.avatar(clientKey(request))) return fail(429, 'rate_limited');
  globalCap.__gitaAvatarCap ??= createDailyCap(config.maxSessionsPerDay);
  if (!globalCap.__gitaAvatarCap()) {
    console.info(JSON.stringify({ event: 'avatar_daily_cap', limit: config.maxSessionsPerDay }));
    return fail(503, 'daily_limit');
  }

  try {
    const session = await createAvatarSession(config);
    console.info(JSON.stringify({ event: 'avatar_session', maxSeconds: session.maxSeconds }));
    return Response.json(session, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const kind = error instanceof AvatarError ? error.kind : 'failed';
    console.info(JSON.stringify({ event: 'avatar_session_failed', kind, detail: safeErrorMessage(error) }));
    return fail(kind === 'rate_limited' ? 429 : 503, kind);
  }
}
