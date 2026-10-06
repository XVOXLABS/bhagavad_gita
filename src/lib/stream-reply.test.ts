import assert from 'node:assert/strict';
import test from 'node:test';
import { CONVERSE_KEYS, partialFields, REPLY_KEYS, SentenceGate } from './stream-reply';

const FULL = JSON.stringify({
  acknowledge: 'Your exams weigh on you. You fear letting your family down.',
  connection: 'Do your work with care, and let go of the result.',
  step: 'Study for one hour today, then rest.',
});

test('partialFields grows monotonically over prefixes of a reply', () => {
  let previous = { acknowledge: '', connection: '', step: '' };
  for (let cut = 0; cut <= FULL.length; cut += 1) {
    const fields = partialFields(FULL.slice(0, cut), ['acknowledge', 'connection', 'step']);
    for (const key of ['acknowledge', 'connection', 'step'] as const) {
      assert.ok(fields[key].text.startsWith(previous[key]), `${key} shrank at ${cut}`);
      previous = { ...previous, [key]: fields[key].text };
    }
  }
  const done = partialFields(FULL, ['acknowledge', 'step']);
  assert.deepEqual(done.acknowledge, { text: 'Your exams weigh on you. You fear letting your family down.', closed: true });
  assert.equal(done.step.closed, true);
});

test('partialFields decodes escapes, ignores fences and stops at an unfinished escape', () => {
  const raw = '```json\n{"acknowledge": "She said \\"rest\\".\\nThen \\u0041 calm';
  assert.deepEqual(partialFields(raw, ['acknowledge']).acknowledge, { text: 'She said "rest".\nThen A calm', closed: false });
  assert.equal(partialFields('{"acknowledge": "half \\u00', ['acknowledge']).acknowledge.text, 'half ');
  assert.equal(partialFields('{"acknowledge": "x\\', ['acknowledge']).acknowledge.text, 'x');
  assert.deepEqual(partialFields('{"acknowledge": "a"', ['connection']).connection, { text: '', closed: false });
});

test('SentenceGate releases whole sentences and flushes a closed field', () => {
  const gate = new SentenceGate(REPLY_KEYS, 'en');
  assert.deepEqual(gate.push('{"acknowledge": "Your exams weigh on you'), []);
  assert.deepEqual(gate.push('{"acknowledge": "Your exams weigh on you. You fear'), [
    { field: 'acknowledge', text: 'Your exams weigh on you.' },
  ]);
  assert.deepEqual(gate.push('{"acknowledge": "Your exams weigh on you. You fear letting them down."'), [
    { field: 'acknowledge', text: ' You fear letting them down.' },
  ]);
  const all = gate.push(FULL.replace('Your exams weigh on you. You fear letting your family down.', 'Your exams weigh on you. You fear letting them down.'));
  assert.deepEqual(
    all.map((item) => item.field),
    ['connection', 'step'],
  );
  assert.equal(gate.leaked, false);
});

test('SentenceGate never splits a verse number and blocks it as a leak', () => {
  const gate = new SentenceGate(REPLY_KEYS, 'en');
  assert.deepEqual(gate.push('{"acknowledge": "As verse 2.'), []);
  assert.deepEqual(gate.push('{"acknowledge": "As verse 2.47 says, act. Then'), []);
  assert.equal(gate.leaked, true);
  assert.deepEqual(gate.push(FULL), []);
});

test('SentenceGate blocks Devanagari in an English reply', () => {
  const gate = new SentenceGate(REPLY_KEYS, 'en');
  gate.push('{"acknowledge": "Remember कर्मण्येवाधिकारस्ते. Then');
  assert.equal(gate.leaked, true);
  assert.equal(gate.emitted, false);
});

test('SentenceGate trims the stock opener from the first sentence', () => {
  const gate = new SentenceGate(CONVERSE_KEYS, 'en');
  assert.deepEqual(gate.push('{"reply": "I hear you — this has been a long, heavy week."}'), [
    { field: 'acknowledge', text: 'This has been a long, heavy week.' },
  ]);
});
