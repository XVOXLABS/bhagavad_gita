import { ElevenError, elevenConfig, streamSpeech } from '@/lib/elevenlabs';
import { safeErrorMessage } from '@/lib/llm';
import { clientKey, limits } from '@/lib/rate-limit';
import { findReply } from '@/lib/session';

export const runtime = 'nodejs';
export const maxDuration = 60;

function fail(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Speaks a reply the server already wrote, looked up by id; it never accepts text from the browser. */
export async function GET(request: Request): Promise<Response> {
  if (!elevenConfig().ttsEnabled) return fail(503, 'disabled');
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId')?.trim() ?? '';
  const replyId = url.searchParams.get('replyId')?.trim() ?? '';
  if (!sessionId || sessionId.length > 80 || !replyId || replyId.length > 80) return fail(400, 'bad_request');

  const reply = findReply(sessionId, replyId);
  if (!reply) return fail(404, 'unknown_reply');
  if (!limits.tts(clientKey(request))) return fail(429, 'rate_limited');

  try {
    const audio = await streamSpeech(reply.speech);
    console.info(JSON.stringify({ event: 'tts', chars: reply.speech.length, language: reply.language }));
    return new Response(audio, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    const kind = error instanceof ElevenError ? error.kind : 'failed';
    console.info(JSON.stringify({ event: 'tts_failed', kind, detail: safeErrorMessage(error) }));
    return fail(kind === 'rate_limited' ? 429 : 503, kind);
  }
}
