import assert from 'node:assert/strict';
import test from 'node:test';
import { ElevenError, elevenConfig, KRISHNA_VOICE_SETTINGS, redactEleven, streamSpeech, transcribe } from './elevenlabs';

const config = elevenConfig({ ELEVENLABS_API_KEY: 'sk_testkey123', ELEVENLABS_VOICE_ID: 'voice42' });

test('config defaults to eleven_v4 and scribe_v2 and needs a key and voice', () => {
  assert.equal(config.ttsModel, 'eleven_v4');
  assert.equal(config.sttModel, 'scribe_v2');
  assert.equal(config.ttsEnabled, true);
  const noVoice = elevenConfig({ ELEVENLABS_API_KEY: 'sk_x' });
  assert.equal(noVoice.ttsEnabled, false);
  assert.equal(noVoice.sttEnabled, true);
  assert.equal(elevenConfig({}).sttEnabled, false);
  assert.equal(elevenConfig({ ELEVENLABS_API_KEY: 'k', ELEVENLABS_VOICE_ID: 'v', ELEVENLABS_TTS_MODEL: 'eleven_flash_v2_5' }).ttsModel, 'eleven_flash_v2_5');
});

test('speech request goes to the streaming endpoint with the key, model and voice settings', async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  const fake = (async (url: string, init: RequestInit) => {
    seen = { url, init };
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
  }) as unknown as typeof fetch;
  const stream = await streamSpeech('Be steady.', config, fake);
  assert.ok(stream);
  assert.ok(seen);
  const { url, init } = seen as { url: string; init: RequestInit };
  assert.equal(url, 'https://api.elevenlabs.io/v1/text-to-speech/voice42/stream?output_format=mp3_44100_128');
  assert.equal((init.headers as Record<string, string>)['xi-api-key'], 'sk_testkey123');
  const body = JSON.parse(String(init.body));
  assert.equal(body.text, 'Be steady.');
  assert.equal(body.model_id, 'eleven_v4');
  assert.deepEqual(body.voice_settings, KRISHNA_VOICE_SETTINGS);
});

test('quota and rate-limit errors are told apart, and keys are redacted', async () => {
  const status = (code: number, text: string) =>
    (async () => new Response(text, { status: code })) as unknown as typeof fetch;
  await assert.rejects(streamSpeech('x', config, status(402, 'payment required')), (error: ElevenError) => error.kind === 'quota');
  await assert.rejects(streamSpeech('x', config, status(401, 'quota_exceeded')), (error: ElevenError) => error.kind === 'quota');
  await assert.rejects(streamSpeech('x', config, status(429, 'too many concurrent requests')), (error: ElevenError) => error.kind === 'rate_limited');
  await assert.rejects(streamSpeech('x', config, status(500, 'boom')), (error: ElevenError) => error.kind === 'failed');
  await assert.rejects(streamSpeech('x', elevenConfig({})), (error: ElevenError) => error.kind === 'disabled');
  assert.equal(redactEleven('bad key sk_abc123XYZ'), 'bad key [redacted]');
});

test('transcription sends the audio to Scribe and returns text and language', async () => {
  let form: FormData | null = null;
  const fake = (async (_url: string, init: RequestInit) => {
    form = init.body as FormData;
    return Response.json({ text: '  I feel   lost  ', language_code: 'en' });
  }) as unknown as typeof fetch;
  const result = await transcribe(new Blob([new Uint8Array(10)], { type: 'audio/webm' }), 'ta', config, fake);
  assert.deepEqual(result, { text: 'I feel lost', language: 'en' });
  assert.ok(form);
  assert.equal((form as FormData).get('model_id'), 'scribe_v2');
  assert.equal((form as FormData).get('language_code'), 'ta');
  assert.ok((form as FormData).get('file') instanceof Blob);
});
