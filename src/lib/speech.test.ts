import assert from 'node:assert/strict';
import test from 'node:test';
import { chunkSentences, MAX_SILENT_TURNS, nextTalkState, pickVoice, speakableText, TALK_OFF, voiceForLanguage, type TalkState } from './speech';

test('speakable text follows the reply order and drops Sanskrit and verse numbers', () => {
  const text = speakableText({
    acknowledge: 'Losing your father is heavy',
    connection: 'As 2.20 teaches, कर्मण्येव what he was does not end.',
    step: 'Write him a letter tonight.',
  });
  assert.equal(text, 'Losing your father is heavy. As teaches, what he was does not end. One step for today. Write him a letter tonight.');
  assert.equal(/[ऀ-ॿ]/.test(text), false);
  assert.equal(/\d+\.\d+/.test(text), false);
  assert.ok(speakableText({ acknowledge: 'Hi.', connection: '', step: '' }, 'Please call 14416.').startsWith('Please call 14416.'));
});

test('chunks keep every word and stay under the limit', () => {
  const long = `${'This is a sentence about letting go. '.repeat(12)}${'word '.repeat(80)}end.`;
  const chunks = chunkSentences(long, 120);
  assert.ok(chunks.length > 3);
  assert.ok(chunks.every((chunk) => chunk.length <= 120));
  assert.equal(chunks.join(' ').split(/\s+/).length, long.trim().split(/\s+/).length);
  assert.deepEqual(chunkSentences('Short. Also short.', 180), ['Short. Also short.']);
});

test('voice choice prefers the saved voice, then Indian English male voices', () => {
  const voices = [
    { name: 'Google US English', lang: 'en-US', default: true },
    { name: 'Google UK English Male', lang: 'en-GB' },
    { name: 'Microsoft Heera', lang: 'en-IN' },
    { name: 'Microsoft Ravi', lang: 'en_IN' },
  ];
  assert.equal(pickVoice(voices)?.name, 'Microsoft Ravi');
  assert.equal(pickVoice(voices, 'Google US English')?.name, 'Google US English');
  assert.equal(pickVoice(voices, 'Gone Voice')?.name, 'Microsoft Ravi');
  assert.equal(pickVoice(voices.slice(0, 2))?.name, 'Google UK English Male');
  assert.equal(pickVoice([]), null);
});

test('talk mode runs the full listen, think, speak loop', () => {
  let state: TalkState = nextTalkState(TALK_OFF, { type: 'start' });
  assert.equal(state.mode, 'listening');
  const firstTurn = state.turn;
  state = nextTalkState(state, { type: 'heard', text: 'I feel lost' });
  assert.equal(state.mode, 'thinking');
  state = nextTalkState(state, { type: 'replied', pause: false });
  assert.equal(state.mode, 'speaking');
  state = nextTalkState(state, { type: 'doneSpeaking' });
  assert.equal(state.mode, 'listening');
  assert.ok(state.turn > firstTurn);
});

test('silence twice pauses, interrupt listens, failures pause, end stops', () => {
  let state = nextTalkState(TALK_OFF, { type: 'start' });
  for (let i = 1; i < MAX_SILENT_TURNS; i += 1) {
    state = nextTalkState(state, { type: 'heard', text: '  ' });
    assert.equal(state.mode, 'listening');
  }
  state = nextTalkState(state, { type: 'silence' });
  assert.equal(state.mode, 'paused');
  state = nextTalkState(state, { type: 'interrupt' });
  assert.equal(state.mode, 'listening');
  assert.equal(state.misses, 0);

  state = nextTalkState(nextTalkState(state, { type: 'heard', text: 'hello' }), { type: 'replied', pause: true });
  state = nextTalkState(state, { type: 'interrupt' });
  assert.equal(state.mode, 'listening');

  state = nextTalkState(nextTalkState(state, { type: 'heard', text: 'hello' }), { type: 'replied', pause: true });
  state = nextTalkState(state, { type: 'doneSpeaking' });
  assert.equal(state.mode, 'paused');

  state = nextTalkState(nextTalkState(state, { type: 'start' }), { type: 'failed', note: 'Microphone blocked.' });
  assert.equal(state.mode, 'paused');
  assert.equal(state.note, 'Microphone blocked.');
  assert.equal(nextTalkState(state, { type: 'end' }).mode, 'off');
});

test('Hindi replies keep their Devanagari; other languages pick a matching voice', () => {
  const hindi = speakableText({ acknowledge: 'आप अकेले नहीं हैं', connection: '', step: 'आज पाँच मिनट शांत बैठें' }, undefined, 'hi');
  assert.ok(hindi.includes('आप अकेले नहीं हैं'));
  assert.equal(hindi.includes('One step for today'), false);
  const voices = [
    { name: 'Microsoft Ravi', lang: 'en-IN' },
    { name: 'Microsoft Valluvar', lang: 'ta-IN' },
    { name: 'Google हिन्दी', lang: 'hi-IN' },
  ];
  assert.equal(voiceForLanguage(voices, 'ta')?.name, 'Microsoft Valluvar');
  assert.equal(voiceForLanguage(voices, 'hi')?.name, 'Google हिन्दी');
  assert.equal(voiceForLanguage(voices, 'te'), null);
  assert.equal(voiceForLanguage(voices, 'en'), null);
});
