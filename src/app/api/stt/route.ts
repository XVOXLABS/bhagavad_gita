import { ElevenError, elevenConfig } from '@/lib/elevenlabs';
import { isLanguage } from '@/lib/language';
import { safeErrorMessage } from '@/lib/llm';
import { clientKey, limits } from '@/lib/rate-limit';
import { isGroqSttAvailable, transcribeAudio } from '@/lib/transcribe';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 2 * 1024 * 1024;

function fail(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

export async function POST(request: Request): Promise<Response> {
  const sttActive = isGroqSttAvailable() || elevenConfig().sttEnabled;
  if (!sttActive) return fail(503, 'disabled');
  if (!limits.stt(clientKey(request))) return fail(429, 'rate_limited');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, 'bad_request');
  }
  const audio = form.get('audio');
  if (!(audio instanceof Blob) || audio.size === 0) return fail(400, 'no_audio');
  if (audio.size > MAX_BYTES) return fail(413, 'too_large');
  if (audio.type && !/^(audio|video)\//.test(audio.type)) return fail(415, 'not_audio');
  const language = form.get('language');

  try {
    const result = await transcribeAudio(audio, isLanguage(language) ? language : undefined);
    console.info(JSON.stringify({ event: 'stt', bytes: audio.size, language: result.language, textLength: result.text.length }));
    return Response.json(result);
  } catch (error) {
    const kind = error instanceof ElevenError ? error.kind : 'failed';
    console.info(JSON.stringify({ event: 'stt_failed', kind, detail: safeErrorMessage(error) }));
    return fail(kind === 'rate_limited' ? 429 : 503, kind);
  }
}
