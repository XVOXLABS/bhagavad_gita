import { loadCorpus, verseKey } from '@/lib/corpus';
import { isStageLine, KRISHNA_GREETING, speakableName, STAGE_LINES, welcomeLine } from '@/lib/greeting';
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

type Speech = { text: string; language: string; kind: string; shared: boolean };

/** Works out what to say. Every source is server-side: a stored reply, a fixed line, or the verse store. */
function chooseSpeech(url: URL): Speech | Response {
  const params = url.searchParams;
  if (params.get('greeting') === '1') return { text: KRISHNA_GREETING, language: 'en', kind: 'greeting', shared: true };

  const line = params.get('line');
  if (line !== null) {
    if (!isStageLine(line)) return fail(400, 'unknown_line');
    return { text: STAGE_LINES[line].say, language: 'en', kind: `line:${line}`, shared: true };
  }

  if (params.get('welcome') === '1') {
    // Only a short, letters-only name is spoken; anything else becomes a plain welcome.
    const name = speakableName(params.get('name'));
    return { text: welcomeLine(name), language: 'en', kind: 'welcome', shared: name === null };
  }

  const ref = params.get('verse');
  if (ref !== null) {
    const match = /^(\d{1,2})\.(\d{1,3})$/.exec(ref);
    const verse = match ? loadCorpus().verses.get(verseKey(Number(match[1]), Number(match[2]))) : undefined;
    if (!verse) return fail(404, 'unknown_verse');
    const meaning = verse.summary ?? verse.englishTranslation ?? '';
    return { text: `Chapter ${verse.chapter}, verse ${verse.verse}. ${meaning}`.trim(), language: 'en', kind: 'verse', shared: true };
  }

  const sessionId = params.get('sessionId')?.trim() ?? '';
  const replyId = params.get('replyId')?.trim() ?? '';
  if (!sessionId || sessionId.length > 80 || !replyId || replyId.length > 80) return fail(400, 'bad_request');
  const reply = findReply(sessionId, replyId);
  if (!reply) return fail(404, 'unknown_reply');
  return { text: reply.speech, language: reply.language, kind: 'reply', shared: false };
}

/**
 * Speaks a reply the server already wrote (by id), one of Krishna's fixed lines, a short welcome
 * by name, or a stored verse's meaning. It never speaks free text from the browser.
 * `format=pcm` is raw 16 kHz audio for the talking avatar.
 */
export async function GET(request: Request): Promise<Response> {
  if (!elevenConfig().ttsEnabled) return fail(503, 'disabled');
  const url = new URL(request.url);
  const format: SpeechFormat = url.searchParams.get('format') === 'pcm' ? 'pcm' : 'mp3';
  const speech = chooseSpeech(url);
  if (speech instanceof Response) return speech;
  if (!limits.tts(clientKey(request))) return fail(429, 'rate_limited');

  try {
    const audio = await streamSpeech(speech.text, undefined, undefined, format);
    console.info(JSON.stringify({ event: 'tts', chars: speech.text.length, language: speech.language, format, kind: speech.kind }));
    return new Response(audio, {
      headers: {
        'Content-Type': CONTENT_TYPES[format],
        // Lines that are the same for everyone can be kept by browsers and the CDN.
        'Cache-Control': speech.shared ? 'public, max-age=86400' : 'private, max-age=3600',
      },
    });
  } catch (error) {
    const kind = error instanceof ElevenError ? error.kind : 'failed';
    console.info(JSON.stringify({ event: 'tts_failed', kind, detail: safeErrorMessage(error) }));
    return fail(kind === 'rate_limited' ? 429 : 503, kind);
  }
}
