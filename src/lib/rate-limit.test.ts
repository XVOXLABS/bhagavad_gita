import assert from 'node:assert/strict';
import test from 'node:test';
import { clientKey, createLimiter } from './rate-limit';
import { appendDraftChunk, appendSession, clearSession, completeDraftReply, findReply, findReplyChunk, registerDraftReply } from './session';

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

test('registers and retrieves streaming pipelined chunks for early voice speech', () => {
  registerDraftReply('sess-pipe', 'reply-pipe-1', 'hi');
  const idx0 = appendDraftChunk('reply-pipe-1', 'Sentence 1 acknowledgement.');
  const idx1 = appendDraftChunk('reply-pipe-1', 'Sentence 2 Gita connection.');

  assert.equal(idx0, 0);
  assert.equal(idx1, 1);

  assert.deepEqual(findReplyChunk('sess-pipe', 'reply-pipe-1', 0), {
    speech: 'Sentence 1 acknowledgement.',
    language: 'hi',
  });
  assert.deepEqual(findReplyChunk('sess-pipe', 'reply-pipe-1', 1), {
    speech: 'Sentence 2 Gita connection.',
    language: 'hi',
  });
  assert.equal(findReplyChunk('sess-pipe', 'reply-pipe-1', 2), null);
  assert.equal(findReplyChunk('wrong-sess', 'reply-pipe-1', 0), null);

  completeDraftReply('reply-pipe-1');
});
