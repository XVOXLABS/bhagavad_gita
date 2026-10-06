import { elevenConfig } from '@/lib/elevenlabs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(): Response {
  const config = elevenConfig();
  return Response.json({ tts: config.ttsEnabled, stt: config.sttEnabled });
}
