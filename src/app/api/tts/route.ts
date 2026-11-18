import { KRISHNA_GREETING } from '@/lib/greeting';
import { ElevenError, elevenConfig, streamSpeech, type SpeechFormat } from '@/lib/elevenlabs';
import { safeErrorMessage } from '@/lib/llm';
import { clientKey, limits } from '@/lib/rate-limit';
import { findReply } from '@/lib/session';

export const runtime = 'nodejs';
export const maxDuration = 60;

const CONTENT_TYPES: Record<SpeechFormat, string> = { mp3: 'audio/mpeg', pcm: 'audio/L16; rate=16000; channels=1' };

function fail(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Speaks a reply the server already wrote, looked up by id, or the fixed greeting.
 * It never accepts text from the browser. `format=pcm` is raw 16 kHz audio for the talking avatar.
 */
export async function GET(request: Request): Promise<Response> {
  if (!elevenConfig().ttsEnabled) return fail(503, 'disabled');
  const url = new URL(request.url);
  const format: SpeechFormat = url.searchParams.get('format') === 'pcm' ? 'pcm' : 'mp3';
  const greeting = url.searchParams.get('greeting') === '1';

  let speech: string;
  let language = 'en';
  if (greeting) {
    speech = KRISHNA_GREETING;
  } else {
    const sessionId = url.searchParams.get('sessionId')?.trim() ?? '';
    const replyId = url.searchParams.get('replyId')?.trim() ?? '';
    if (!sessionId || sessionId.length > 80 || !replyId || replyId.length > 80) return fail(400, 'bad_request');
    const reply = findReply(sessionId, replyId);
    if (!reply) return fail(404, 'unknown_reply');
    speech = reply.speech;
    language = reply.language;
  }
  if (!limits.tts(clientKey(request))) return fail(429, 'rate_limited');

  try {
    const audio = await streamSpeech(speech, undefined, undefined, format);
    console.info(JSON.stringify({ event: 'tts', chars: speech.length, language, format, greeting }));
    return new Response(audio, {
      headers: {
        'Content-Type': CONTENT_TYPES[format],
        // The greeting is the same for everyone, so browsers and the CDN can keep it.
        'Cache-Control': greeting ? 'public, max-age=86400' : 'private, max-age=3600',
      },
    });
  } catch (error) {
    const kind = error instanceof ElevenError ? error.kind : 'failed';
    console.info(JSON.stringify({ event: 'tts_failed', kind, detail: safeErrorMessage(error) }));
    return fail(kind === 'rate_limited' ? 429 : 503, kind);
  }
}
