const API = 'https://api.elevenlabs.io/v1';

export type ElevenConfig = {
  apiKey: string;
  voiceId: string;
  ttsModel: string;
  sttModel: string;
  ttsEnabled: boolean;
  sttEnabled: boolean;
};

export function elevenConfig(env: Record<string, string | undefined> = process.env): ElevenConfig {
  const apiKey = env.ELEVENLABS_API_KEY?.trim() ?? '';
  const voiceId = env.ELEVENLABS_VOICE_ID?.trim() ?? '';
  return {
    apiKey,
    voiceId,
    ttsModel: env.ELEVENLABS_TTS_MODEL?.trim() || 'eleven_v4',
    sttModel: env.ELEVENLABS_STT_MODEL?.trim() || 'scribe_v2',
    ttsEnabled: Boolean(apiKey && voiceId),
    sttEnabled: Boolean(apiKey),
  };
}

/** Calm, steady, slightly unhurried. */
export const KRISHNA_VOICE_SETTINGS = {
  stability: 0.6,
  similarity_boost: 0.8,
  style: 0.2,
  use_speaker_boost: true,
  speed: 0.95,
};

export type ElevenErrorKind = 'disabled' | 'quota' | 'rate_limited' | 'failed';

export class ElevenError extends Error {
  constructor(
    readonly kind: ElevenErrorKind,
    message: string,
  ) {
    super(message);
  }
}

export function redactEleven(message: string): string {
  return message.replace(/sk_[A-Za-z0-9]+/g, '[redacted]');
}

async function failure(response: Response): Promise<ElevenError> {
  const body = (await response.text().catch(() => '')).slice(0, 400);
  const detail = redactEleven(`ElevenLabs ${response.status}: ${body}`);
  if (response.status === 401 || response.status === 402 || /quota|credit|limit_exceeded|insufficient/i.test(body)) {
    return new ElevenError('quota', detail);
  }
  if (response.status === 429) return new ElevenError('rate_limited', detail);
  return new ElevenError('failed', detail);
}

/** Streams Krishna's words as mp3 so playback can start before generation finishes. */
export async function streamSpeech(
  text: string,
  config: ElevenConfig = elevenConfig(),
  fetcher: typeof fetch = fetch,
): Promise<ReadableStream<Uint8Array>> {
  if (!config.ttsEnabled) throw new ElevenError('disabled', 'ElevenLabs speech is not configured');
  const response = await fetcher(
    `${API}/text-to-speech/${encodeURIComponent(config.voiceId)}/stream?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': config.apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: config.ttsModel, voice_settings: KRISHNA_VOICE_SETTINGS }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok || !response.body) throw await failure(response);
  return response.body;
}

export type Transcript = { text: string; language: string | null };

export async function transcribe(
  audio: Blob,
  languageHint?: string,
  config: ElevenConfig = elevenConfig(),
  fetcher: typeof fetch = fetch,
): Promise<Transcript> {
  if (!config.sttEnabled) throw new ElevenError('disabled', 'ElevenLabs transcription is not configured');
  const form = new FormData();
  form.append('model_id', config.sttModel);
  form.append('file', audio, 'speech.webm');
  form.append('tag_audio_events', 'false');
  if (languageHint) form.append('language_code', languageHint);
  const response = await fetcher(`${API}/speech-to-text`, {
    method: 'POST',
    headers: { 'xi-api-key': config.apiKey },
    body: form,
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw await failure(response);
  const data = (await response.json()) as { text?: unknown; language_code?: unknown };
  return {
    text: typeof data.text === 'string' ? data.text.replace(/\s+/g, ' ').trim() : '',
    language: typeof data.language_code === 'string' ? data.language_code : null,
  };
}
