import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { lookup } from './corpus';
import { detectFastIntent } from './pipeline';
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
  stripEchoedInput,
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

  const ack = parseSituation(JSON.stringify({ intent: 'acknowledgment', replyLanguage: 'ta' }), 'சரி சரி நீ சொல்ற மாதிரி நான் பண்றேன்');
  assert.equal(ack.intent, 'acknowledgment');
  assert.equal(needsVerse(ack.intent), false);

  const followUp = parseSituation(JSON.stringify({ intent: 'follow_up', replyLanguage: 'en' }), 'tell me more');
  assert.equal(followUp.intent, 'follow_up');
  assert.equal(needsVerse(followUp.intent), false);

  const companion = parseSituation(JSON.stringify({ intent: 'companion', replyLanguage: 'ta' }), 'bore அடிக்குது என்கூட பேசுடா');
  assert.equal(companion.intent, 'companion');
  assert.equal(needsVerse(companion.intent), false);

  assert.equal(parseSituation(JSON.stringify({ intent: 'nonsense' }), 'x').intent, 'problem');
  const crisis = parseSituation(JSON.stringify({ intent: 'greeting', crisis: true }), 'bye forever');
  assert.equal(crisis.intent, 'problem');
  assert.equal(needsVerse(crisis.intent), true);
  assert.equal(needsVerse('problem'), true);
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

test('stripEchoedInput removes parroted user text and prevents echoing', () => {
  const userTamil = 'ஏய், எனக்கு ரொம்ப confusion ஆ இருக்கு கொஞ்சம். எந்த முடிவு எடுக்குறதுன்னு தெரியல.';
  // Exact duplicate is replaced with compassionate default in that language
  const strippedExact = stripEchoedInput(userTamil, userTamil, 'ta');
  assert.equal(strippedExact, 'உன் மனதின் நிலையை நான் உணர்கிறேன், என் நண்பா.');

  // Prefixed duplicate is stripped, preserving the unique reply
  const echoedWithReply = `${userTamil}\n\nஉன் மனதில் அமைதியை நிலைநிறுத்து, நான் உன்னோடு இருக்கிறேன்.`;
  const strippedPrefix = stripEchoedInput(echoedWithReply, userTamil, 'ta');
  assert.equal(strippedPrefix, 'உன் மனதில் அமைதியை நிலைநிறுத்து, நான் உன்னோடு இருக்கிறேன்.');

  // Genuine non-echoed reply remains untouched
  const genuineReply = 'உன் குழப்பத்தை என்னிடம் பகிர்ந்ததற்கு நன்றி, என் நண்பா.';
  assert.equal(stripEchoedInput(genuineReply, userTamil, 'ta'), genuineReply);

  // English fallback
  assert.equal(
    stripEchoedInput('I am feeling so stressed today', 'I am feeling so stressed today', 'en'),
    'I hear the weight upon your heart, my friend, and I walk beside you.',
  );
});

test('stock openers are trimmed but real sentences are kept', () => {
  assert.equal(tidyOpener('I hear you—you feel unheard at home.'), 'You feel unheard at home.');
  assert.equal(tidyOpener('I see you failed your exam and your parents are angry.'), 'You failed your exam and your parents are angry.');
  assert.equal(tidyOpener('It sounds like the week has been heavy.'), 'The week has been heavy.');
  assert.equal(tidyOpener('I see.'), 'I see.');
  assert.equal(tidyOpener('Losing a parent changes everything.'), 'Losing a parent changes everything.');
});

test('detectFastIntent handles Tamil acknowledgments and names with correct language', () => {
  const ackTa = detectFastIntent('Okay கிருஷ்ணா.', 'en');
  assert.ok(ackTa);
  assert.equal(ackTa.intent, 'acknowledgment');
  assert.equal(ackTa.replyLanguage, 'ta');

  const ackSari = detectFastIntent('சரி கிருஷ்ணா', 'en');
  assert.ok(ackSari);
  assert.equal(ackSari.intent, 'acknowledgment');
  assert.equal(ackSari.replyLanguage, 'ta');

  const ackEn = detectFastIntent('thanks krishna', 'en');
  assert.ok(ackEn);
  assert.equal(ackEn.intent, 'acknowledgment');
  assert.equal(ackEn.replyLanguage, 'en');
});
