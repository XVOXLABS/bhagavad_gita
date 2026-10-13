export { KRISHNA_GREETING } from './greeting';

const SESSION_URL = 'https://api.anam.ai/v1/auth/session-token';

export type AvatarConfig = {
  apiKey: string;
  avatarId: string;
  model: string;
  /** Hard cap on one live session; the Free plan stops at 180 s anyway. */
  maxSeconds: number;
  maxSessionsPerDay: number;
  enabled: boolean;
};

function positive(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function avatarConfig(env: Record<string, string | undefined> = process.env): AvatarConfig {
  const apiKey = env.ANAM_API_KEY?.trim() ?? '';
  const avatarId = env.ANAM_AVATAR_ID?.trim() ?? '';
  return {
    apiKey,
    avatarId,
    // Empty means: let Anam use the model the avatar was made with. Forcing one it does not support fails the session.
    model: env.ANAM_AVATAR_MODEL?.trim() ?? '',
    maxSeconds: positive(env.AVATAR_MAX_SESSION_SECONDS, 180),
    maxSessionsPerDay: positive(env.AVATAR_MAX_SESSIONS_PER_DAY, 50),
    enabled: Boolean(apiKey && avatarId),
  };
}

export type AvatarErrorKind = 'disabled' | 'quota' | 'rate_limited' | 'failed';

export class AvatarError extends Error {
  constructor(
    readonly kind: AvatarErrorKind,
    message: string,
  ) {
    super(message);
  }
}

/** Anam keys have no fixed prefix, so the configured key itself is what gets hidden. */
export function redactAvatar(message: string, apiKey = process.env.ANAM_API_KEY?.trim() ?? ''): string {
  return apiKey.length >= 8 ? message.split(apiKey).join('[redacted]') : message;
}

export type AvatarSession = { sessionToken: string; maxSeconds: number };

/**
 * Asks Anam for a short-lived session token. Audio passthrough is on: Anam only draws the face
 * for audio we send it, so Krishna's words and voice always come from our own pipeline.
 */
export async function createAvatarSession(
  config: AvatarConfig = avatarConfig(),
  fetcher: typeof fetch = fetch,
): Promise<AvatarSession> {
  if (!config.enabled) throw new AvatarError('disabled', 'The avatar is not configured');
  const response = await fetcher(SESSION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      // The audio-passthrough config accepts only these fields; anything else makes Anam reject it.
      // The session length is enforced by our own client instead (see maxSeconds).
      personaConfig: {
        avatarId: config.avatarId,
        ...(config.model ? { avatarModel: config.model } : {}),
        enableAudioPassthrough: true,
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const body = (await response.text().catch(() => '')).slice(0, 400);
    const detail = redactAvatar(`Anam ${response.status}: ${body}`, config.apiKey);
    if (response.status === 402 || /quota|credit|limit|usage|insufficient|concurren/i.test(body)) {
      throw new AvatarError(response.status === 429 ? 'rate_limited' : 'quota', detail);
    }
    if (response.status === 429) throw new AvatarError('rate_limited', detail);
    throw new AvatarError('failed', detail);
  }
  const data = (await response.json().catch(() => ({}))) as { sessionToken?: unknown };
  if (typeof data.sessionToken !== 'string' || !data.sessionToken) {
    throw new AvatarError('failed', 'Anam returned no session token');
  }
  return { sessionToken: data.sessionToken, maxSeconds: config.maxSeconds };
}

/** Counts sessions per UTC day so a busy day cannot run up an unbounded bill. Best effort per server. */
export function createDailyCap(limit: number) {
  let day = '';
  let used = 0;
  return function take(now = new Date()): boolean {
    const today = now.toISOString().slice(0, 10);
    if (today !== day) {
      day = today;
      used = 0;
    }
    if (used >= limit) return false;
    used += 1;
    return true;
  };
}
