import OpenAI from 'openai';
import { transcribe as transcribeEleven, elevenConfig, type Transcript } from './elevenlabs';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
let groqClient: OpenAI | null = null;

function getGroqClient(): OpenAI | null {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) return null;
  groqClient ??= new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });
  return groqClient;
}

export function isGroqSttAvailable(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

/**
 * High-speed transcription using Groq's whisper-large-v3-turbo (100-150ms latency).
 * Gracefully falls back to ElevenLabs Scribe if Groq is unavailable.
 */
export async function transcribeAudio(
  audio: Blob,
  languageHint?: string,
): Promise<Transcript> {
  const client = getGroqClient();
  if (client) {
    try {
      const arrayBuffer = await audio.arrayBuffer();
      const filename = audio.type.includes('mp4') ? 'speech.mp4' : 'speech.webm';
      const file = new File([arrayBuffer], filename, { type: audio.type || 'audio/webm' });

      const t0 = performance.now();
      const res = await client.audio.transcriptions.create({
        file,
        model: 'whisper-large-v3-turbo',
        language: languageHint,
        response_format: 'verbose_json',
      });
      const duration = Math.round(performance.now() - t0);
      console.info(JSON.stringify({ event: 'groq_whisper_stt', durationMs: duration, textLength: res.text?.length }));

      const text = typeof res.text === 'string' ? res.text.replace(/\s+/g, ' ').trim() : '';
      const lang = typeof (res as { language?: unknown }).language === 'string' ? (res as { language: string }).language : null;
      if (text) {
        return { text, language: lang };
      }
    } catch (groqError) {
      console.warn(JSON.stringify({ event: 'groq_stt_fallback', error: String(groqError) }));
    }
  }

  // Fallback to ElevenLabs Scribe if Groq is unavailable or failed
  if (elevenConfig().sttEnabled) {
    return transcribeEleven(audio, languageHint);
  }

  return { text: '', language: null };
}
