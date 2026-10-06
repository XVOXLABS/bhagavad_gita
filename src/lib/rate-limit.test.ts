import assert from 'node:assert/strict';
import test from 'node:test';
import { clientKey, createLimiter } from './rate-limit';
import { appendSession, clearSession, findReply } from './session';

test('the limiter allows N requests per window, per client, then recovers', () => {
  const allow = createLimiter(2, 1000);
  assert.equal(allow('a', 0), true);
  assert.equal(allow('a', 100), true);
  assert.equal(allow('a', 200), false);
  assert.equal(allow('b', 200), true);
  assert.equal(allow('a', 1101), true);
});

test('the client key comes from the first forwarded address', () => {
  const request = new Request('http://x', { headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' } });
  assert.equal(clientKey(request), '1.2.3.4');
  assert.equal(clientKey(new Request('http://x')), 'local');
});

test('only replies the server stored can be found for speech', () => {
  appendSession('s-voice', [
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'Hello.', replyId: 'r1', speech: 'Hello there.', language: 'ta' },
  ]);
  assert.deepEqual(findReply('s-voice', 'r1'), { speech: 'Hello there.', language: 'ta' });
  assert.equal(findReply('s-voice', 'nope'), null);
  assert.equal(findReply('other', 'r1'), null);
  clearSession('s-voice');
  assert.equal(findReply('s-voice', 'r1'), null);
});
