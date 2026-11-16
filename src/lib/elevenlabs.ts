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

export type SpeechFormat = 'mp3' | 'pcm';

/** mp3 for the browser's own player; raw 16 kHz 16-bit mono PCM for the talking avatar. */
export const OUTPUT_FORMATS: Record<SpeechFormat, string> = { mp3: 'mp3_44100_128', pcm: 'pcm_16000' };

/** Streams Krishna's words so playback can start before generation finishes. */
export async function streamSpeech(
  text: string,
  config: ElevenConfig = elevenConfig(),
  fetcher: typeof fetch = fetch,
  format: SpeechFormat = 'mp3',
): Promise<ReadableStream<Uint8Array>> {
  if (!config.ttsEnabled) throw new ElevenError('disabled', 'ElevenLabs speech is not configured');
  const response = await fetcher(
    `${API}/text-to-speech/${encodeURIComponent(config.voiceId)}/stream?output_format=${OUTPUT_FORMATS[format]}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': config.apiKey,
        'Content-Type': 'application/json',
        Accept: format === 'pcm' ? 'audio/pcm' : 'audio/mpeg',
      },
      body: JSON.stringify({ text, model_id: config.ttsModel, voice_settings: KRISHNA_VOICE_SETTINGS }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok || !response.body) throw await failure(response);

  const historyItemId = response.headers.get('history-item-id') || response.headers.get('history_item_id');
  if (historyItemId) {
    // Zero-retention: delete the history item from ElevenLabs as soon as generation completes
    const transform = new TransformStream<Uint8Array, Uint8Array>({
      flush() {
        void deleteHistoryItem(historyItemId, config, fetcher).catch(() => undefined);
      },
    });
    return response.body.pipeThrough(transform);
  }

  return response.body;
}

/**
 * Deletes a generated audio item and its text transcript from ElevenLabs history.
 * Ensures zero data retention on ElevenLabs servers for the user's conversation.
 */
export async function deleteHistoryItem(
  historyItemId: string,
  config: ElevenConfig = elevenConfig(),
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (!config.apiKey || !historyItemId) return false;
  try {
    const response = await fetcher(`${API}/history/${encodeURIComponent(historyItemId)}`, {
      method: 'DELETE',
      headers: { 'xi-api-key': config.apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Deletes a speech-to-text transcript from ElevenLabs servers immediately after transcription.
 */
export async function deleteTranscription(
  transcriptionId: string,
  config: ElevenConfig = elevenConfig(),
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (!config.apiKey || !transcriptionId) return false;
  try {
    const response = await fetcher(`${API}/speech-to-text/transcripts/${encodeURIComponent(transcriptionId)}`, {
      method: 'DELETE',
      headers: { 'xi-api-key': config.apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    return false;
  }
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
  const data = (await response.json()) as { text?: unknown; language_code?: unknown; transcription_id?: unknown };
  const transcriptionId = typeof data.transcription_id === 'string' ? data.transcription_id : null;
  if (transcriptionId) {
    // Zero-retention: delete transcript from ElevenLabs immediately
    void deleteTranscription(transcriptionId, config, fetcher).catch(() => undefined);
  }
  return {
    text: typeof data.text === 'string' ? data.text.replace(/\s+/g, ' ').trim() : '',
    language: typeof data.language_code === 'string' ? data.language_code : null,
  };
}
