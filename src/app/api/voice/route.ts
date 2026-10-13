import { avatarConfig } from '@/lib/avatar';
import { elevenConfig } from '@/lib/elevenlabs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(): Response {
  const config = elevenConfig();
  // The face speaks ElevenLabs audio, so it is only offered when that voice is available too.
  return Response.json({
    tts: config.ttsEnabled,
    stt: config.sttEnabled,
    avatar: config.ttsEnabled && avatarConfig().enabled,
  });
}
