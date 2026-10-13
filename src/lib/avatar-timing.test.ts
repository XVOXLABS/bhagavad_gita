import assert from 'node:assert/strict';
import test from 'node:test';
import { canSpeak, evenChunk, nextAvatarState, speechEndsAt, type AvatarState } from './avatar-timing';

test('speech ends after the lead-in plus the audio length', () => {
  assert.equal(speechEndsAt(1_000, 32_000), 1_000 + 800 + 1_000);
  assert.equal(speechEndsAt(0, 0), 800);
  assert.equal(speechEndsAt(0, 16_000), 1_300);
});

test('odd bytes are carried so no 16-bit sample is split', () => {
  const first = evenChunk(null, new Uint8Array([1, 2, 3]));
  assert.deepEqual([...first.send], [1, 2]);
  assert.deepEqual([...(first.carry ?? [])], [3]);
  const second = evenChunk(first.carry, new Uint8Array([4, 5, 6]));
  assert.deepEqual([...second.send], [3, 4, 5, 6]);
  assert.equal(second.carry, null);
  const even = evenChunk(null, new Uint8Array([7, 8]));
  assert.deepEqual([...even.send], [7, 8]);
  assert.equal(even.carry, null);
});

test('the face only takes a reply when it is live and quiet, and falls back after a close or error', () => {
  let state: AvatarState = 'idle';
  state = nextAvatarState(state, 'connect');
  assert.equal(state, 'connecting');
  assert.equal(canSpeak(state), false);
  state = nextAvatarState(state, 'connected');
  assert.equal(state, 'ready');
  assert.equal(canSpeak(state), true);
  state = nextAvatarState(state, 'speak');
  assert.equal(state, 'speaking');
  assert.equal(canSpeak(state), false);
  state = nextAvatarState(state, 'spoke');
  assert.equal(state, 'ready');
  state = nextAvatarState(state, 'closed');
  assert.equal(state, 'ended');
  assert.equal(canSpeak(state), false);
  assert.equal(nextAvatarState('connecting', 'error'), 'failed');
  assert.equal(nextAvatarState('ended', 'connect'), 'connecting');
  assert.equal(nextAvatarState('speaking', 'disconnect'), 'idle');
  assert.equal(nextAvatarState('idle', 'closed'), 'idle');
});
