import assert from 'node:assert/strict';
import test from 'node:test';
import { AvatarError, avatarConfig, createAvatarSession, createDailyCap, redactAvatar } from './avatar';

const KEY = 'anam_test_key_123456';
const config = avatarConfig({ ANAM_API_KEY: KEY, ANAM_AVATAR_ID: 'face-42' });

test('the avatar is on only with both a key and an avatar id', () => {
  assert.equal(config.enabled, true);
  assert.equal(config.model, '');
  assert.equal(config.maxSeconds, 180);
  assert.equal(avatarConfig({ ANAM_API_KEY: KEY }).enabled, false);
  assert.equal(avatarConfig({ ANAM_AVATAR_ID: 'face-42' }).enabled, false);
  assert.equal(avatarConfig({ ANAM_API_KEY: KEY, ANAM_AVATAR_ID: 'f', AVATAR_MAX_SESSION_SECONDS: '90' }).maxSeconds, 90);
  assert.equal(avatarConfig({ ANAM_API_KEY: KEY, ANAM_AVATAR_ID: 'f', AVATAR_MAX_SESSION_SECONDS: 'nope' }).maxSeconds, 180);
});

test('the session request uses the Bearer key, passthrough audio and a length cap', async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  const fake = (async (url: string, init: RequestInit) => {
    seen = { url, init };
    return Response.json({ sessionToken: 'tok_abc' });
  }) as unknown as typeof fetch;
  const session = await createAvatarSession(config, fake);
  assert.deepEqual(session, { sessionToken: 'tok_abc', maxSeconds: 180 });
  const { url, init } = seen as unknown as { url: string; init: RequestInit };
  assert.equal(url, 'https://api.anam.ai/v1/auth/session-token');
  assert.equal((init.headers as Record<string, string>).Authorization, `Bearer ${KEY}`);
  const persona = JSON.parse(String(init.body)).personaConfig;
  assert.equal(persona.avatarId, 'face-42');
  assert.equal(persona.enableAudioPassthrough, true);
  assert.deepEqual(Object.keys(persona).sort(), ['avatarId', 'enableAudioPassthrough']);
  assert.ok(!JSON.stringify(session).includes(KEY));
});

test('errors are classified and never contain the key', async () => {
  const status = (code: number, text: string) => (async () => new Response(text, { status: code })) as unknown as typeof fetch;
  await assert.rejects(createAvatarSession(config, status(402, 'payment required')), (error: AvatarError) => error.kind === 'quota');
  await assert.rejects(createAvatarSession(config, status(429, 'slow down')), (error: AvatarError) => error.kind === 'rate_limited');
  await assert.rejects(
    createAvatarSession(config, status(500, `bad key ${KEY}`)),
    (error: AvatarError) => error.kind === 'failed' && !error.message.includes(KEY),
  );
  await assert.rejects(createAvatarSession(avatarConfig({})), (error: AvatarError) => error.kind === 'disabled');
  await assert.rejects(
    createAvatarSession(config, (async () => Response.json({})) as unknown as typeof fetch),
    (error: AvatarError) => error.kind === 'failed',
  );
  assert.equal(redactAvatar(`x ${KEY} y`, KEY), 'x [redacted] y');
});

test('the daily cap blocks after the limit and resets the next day', () => {
  const take = createDailyCap(2);
  const day1 = new Date('2026-10-13T10:00:00Z');
  assert.equal(take(day1), true);
  assert.equal(take(day1), true);
  assert.equal(take(day1), false);
  assert.equal(take(new Date('2026-10-14T00:01:00Z')), true);
});

test('a model is only sent when one is set explicitly', async () => {
  let body = '';
  const fake = (async (_url: string, init: RequestInit) => {
    body = String(init.body);
    return Response.json({ sessionToken: 't' });
  }) as unknown as typeof fetch;
  await createAvatarSession(avatarConfig({ ANAM_API_KEY: KEY, ANAM_AVATAR_ID: 'f', ANAM_AVATAR_MODEL: 'cara-3' }), fake);
  assert.equal(JSON.parse(body).personaConfig.avatarModel, 'cara-3');
});
