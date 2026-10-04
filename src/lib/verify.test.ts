import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { lookup } from './corpus';
import {
  citesOnlyPrior,
  evaluateSelection,
  guidanceLeaks,
  needsVerse,
  parseConversation,
  parseReply,
  parseSelection,
  parseSituation,
  replyLeaks,
  replyText,
  tidyOpener,
} from './verify';

test('copies 2.47 from the corpus and ignores scripture in the model payload', () => {
  const records = JSON.parse(readFileSync('verse.json', 'utf8')) as { chapter_number: number; verse_number: number; text: string }[];
  const source = records.find((record) => record.chapter_number === 2 && record.verse_number === 47);
  assert.ok(source);

  const parsed = parseSelection(
    JSON.stringify({
      no_strong_match: false,
      citations: [{ chapter: 2, verse: 47 }],
      reason: 'work anxiety',
      sanskrit: 'FAKE SANSKRIT',
    }),
  );
  assert.ok(parsed);
  const result = evaluateSelection(parsed, ['2.47', '2.48']);
  assert.equal(result.status, 'answered');
  assert.equal(result.verses.length, 1);
  assert.equal(result.verses[0]?.sanskrit, source.text.normalize('NFC').trim());
  assert.equal(result.verses[0]?.sanskrit, lookup(2, 47)?.sanskrit);
  assert.equal(result.verses[0]?.sanskrit.includes('FAKE'), false);
});

test('drops an unknown verse and keeps a real one', () => {
  const result = evaluateSelection(
    { no_strong_match: false, reason: '', citations: [{ chapter: 2, verse: 99 }, { chapter: 2, verse: 47 }] },
    ['2.99', '2.47'],
  );
  assert.equal(result.status, 'answered');
  assert.deepEqual(result.verses.map((verse) => `${verse.chapter}.${verse.verse}`), ['2.47']);
  assert.deepEqual(result.dropped, ['2.99']);
});

test('a real verse that was not on the shortlist is rejected', () => {
  const result = evaluateSelection({ no_strong_match: false, reason: '', citations: [{ chapter: 18, verse: 66 }] }, ['2.47']);
  assert.equal(result.status, 'needs_citations');
  assert.deepEqual(result.verses, []);
  assert.deepEqual(result.dropped, ['18.66']);
});

test('no more than two verses are kept', () => {
  const result = evaluateSelection(
    {
      no_strong_match: false,
      reason: '',
      citations: [{ chapter: 2, verse: 47 }, { chapter: 2, verse: 48 }, { chapter: 2, verse: 50 }],
    },
    ['2.47', '2.48', '2.50'],
  );
  assert.equal(result.verses.length, 2);
  assert.deepEqual(result.dropped, ['2.50']);
});

test('no_strong_match returns no verses', () => {
  const parsed = parseSelection(JSON.stringify({ no_strong_match: true, citations: [{ chapter: 2, verse: 47 }] }));
  assert.ok(parsed);
  const result = evaluateSelection(parsed, ['2.47']);
  assert.equal(result.status, 'no_strong_match');
  assert.deepEqual(result.verses, []);
});

test('a selection with neither citations nor no_strong_match is not usable', () => {
  assert.equal(parseSelection('not json'), null);
  assert.equal(parseSelection(JSON.stringify({ citations: [] })), null);
  assert.equal(parseSelection('```json\n{"no_strong_match":true,"citations":[]}\n```')?.no_strong_match, true);
});

test('reply fields are parsed and verse numbers or Devanagari count as leaks', () => {
  const reply = parseReply(
    JSON.stringify({ acknowledge: 'Losing your father is heavy.', connection: 'What he was does not end.', step: 'Write him a letter.' }),
  );
  assert.ok(reply);
  assert.equal(replyLeaks(reply), false);
  assert.equal(replyText(reply), 'Losing your father is heavy.\n\nWhat he was does not end.\n\nWrite him a letter.');
  assert.equal(replyLeaks({ ...reply, connection: 'As 2.20 says, the soul is not born.' }), true);
  assert.equal(replyLeaks({ ...reply, step: 'Chant कर्मण्येव daily.' }), true);
  assert.equal(parseReply(JSON.stringify({ step: 'only a step' })), null);
});

test('situation parsing keeps known themes and falls back to keywords', () => {
  const situation = parseSituation(
    JSON.stringify({
      emotions: ['grief'],
      situation: 'Their mother died last month.',
      need: 'comfort',
      themes: ['grief-loss', 'made-up-theme', 'narrative'],
      crisis: false,
      continuesPrevious: false,
    }),
    'my mother died',
  );
  assert.deepEqual(situation.themes, ['grief-loss']);
  assert.equal(situation.need, 'comfort');

  const fallback = parseSituation('garbage', 'I am so angry at my brother');
  assert.equal(fallback.situation, 'I am so angry at my brother');
  assert.ok(fallback.themes.includes('anger'));
  assert.equal(fallback.crisis, false);
});

test('a new situation that repeats earlier verses asks for another verse', () => {
  assert.equal(citesOnlyPrior('I am afraid of the future', ['2.47', '2.48'], ['2.47', '2.48']), true);
  assert.equal(citesOnlyPrior('I am afraid of the future', ['2.47', '2.48'], ['2.47', '18.66']), false);
  assert.equal(citesOnlyPrior('tell me more about that verse', ['2.47'], ['2.47']), false);
});

test('intent decides whether a verse is needed, and crisis always gets one', () => {
  const greeting = parseSituation(JSON.stringify({ intent: 'greeting', replyLanguage: 'en', themes: ['grief-loss'] }), 'hey');
  assert.equal(greeting.intent, 'greeting');
  assert.equal(needsVerse(greeting.intent), false);
  assert.deepEqual(greeting.themes, []);
  assert.equal(greeting.situation, '');

  assert.equal(parseSituation(JSON.stringify({ intent: 'nonsense' }), 'x').intent, 'problem');
  const crisis = parseSituation(JSON.stringify({ intent: 'greeting', crisis: true }), 'bye forever');
  assert.equal(crisis.intent, 'problem');
  assert.equal(needsVerse(crisis.intent), true);
});

test('reply language comes from the model, else the script, else the earlier conversation', () => {
  assert.equal(parseSituation(JSON.stringify({ intent: 'language_request', replyLanguage: 'ta' }), 'speak tamil').replyLanguage, 'ta');
  assert.equal(parseSituation('garbage', 'நீ தமிழ்ல பேசு').replyLanguage, 'ta');
  assert.equal(parseSituation('garbage', 'ok tell me more', 'hi').replyLanguage, 'hi');
  assert.equal(parseSituation(JSON.stringify({ replyLanguage: 'xx' }), 'hello').replyLanguage, 'en');
});

test('Devanagari is fine in a Hindi reply but quoted Sanskrit is not', () => {
  const sanskrit = lookup(2, 47)?.sanskrit ?? '';
  assert.equal(guidanceLeaks('आप अपना काम पूरे मन से करें।', 'hi', [sanskrit]), false);
  assert.equal(guidanceLeaks('आप अपना काम पूरे मन से करें।', 'en', [sanskrit]), true);
  const quote = sanskrit.split(/\s+/).slice(0, 4).join(' ');
  assert.equal(guidanceLeaks(`याद रखें: ${quote}`, 'hi', [sanskrit]), true);
  assert.equal(guidanceLeaks('நீங்கள் தனியாக இல்லை.', 'ta'), false);
  assert.equal(guidanceLeaks('See 2.47 today.', 'ta'), true);
});

test('a conversational reply is parsed or rejected', () => {
  assert.equal(parseConversation(JSON.stringify({ reply: ' Hello, friend. ' })), 'Hello, friend.');
  assert.equal(parseConversation('{"reply": ""}'), null);
  assert.equal(parseConversation('not json'), null);
});

test('stock openers are trimmed but real sentences are kept', () => {
  assert.equal(tidyOpener('I hear you—you feel unheard at home.'), 'You feel unheard at home.');
  assert.equal(tidyOpener('I see you failed your exam and your parents are angry.'), 'You failed your exam and your parents are angry.');
  assert.equal(tidyOpener('It sounds like the week has been heavy.'), 'The week has been heavy.');
  assert.equal(tidyOpener('I see.'), 'I see.');
  assert.equal(tidyOpener('Losing a parent changes everything.'), 'Losing a parent changes everything.');
});
