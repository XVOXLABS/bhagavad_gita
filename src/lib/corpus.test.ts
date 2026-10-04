import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildCacheDocument, loadCorpus, lookup, verseNote } from './corpus';

const SOURCE_SHA256 = 'bb599e666e552bd65080f1f8da6d488f067237f64091ab265978861cf3fadec7';

type SourceRecord = {
  chapter_number: number;
  verse_number: number;
  text: string;
  transliteration: string;
  word_meanings: string;
};

function sourceVerse(chapter: number, verse: number): SourceRecord {
  const records = JSON.parse(readFileSync('verse.json', 'utf8')) as SourceRecord[];
  const found = records.find((record) => record.chapter_number === chapter && record.verse_number === verse);
  if (!found) throw new Error(`missing ${chapter}.${verse}`);
  return found;
}

test('loads 701 verses across 18 chapters with no duplicate keys', () => {
  const corpus = loadCorpus();
  assert.equal(corpus.verseCount, 701);
  assert.equal(corpus.verses.size, 701);
  assert.equal(corpus.chapterCount, 18);
  assert.equal(corpus.duplicateKeys, 0);
  assert.equal(corpus.sha256, SOURCE_SHA256);
  assert.ok(lookup(2, 47));
  assert.equal(lookup(2, 73), undefined);
  assert.equal(lookup(19, 1), undefined);
});

test('quarantines mismatched Latin fields and keeps usable ones', () => {
  for (const ref of [
    [1, 5],
    [1, 6],
    [11, 19],
  ] as const) {
    const verse = lookup(ref[0], ref[1]);
    assert.ok(verse);
    assert.ok(verse.sanskrit.length > 0);
    assert.equal(verse.transliteration, null);
    assert.equal(verse.wordMeanings, null);
  }

  const ten = lookup(10, 33);
  assert.ok(ten);
  assert.equal(ten.transliteration, null);
  assert.ok(ten.wordMeanings && ten.wordMeanings.includes('—'));

  const last = lookup(18, 78);
  assert.ok(last);
  assert.ok(last.sanskrit.includes('योगेश्वर'));
  assert.ok(last.transliteration);
  assert.ok(last.wordMeanings);

  assert.equal(loadCorpus().withheldFieldCount, 7);
});

test('cache document copies stored Sanskrit and omits withheld fields', () => {
  const source = sourceVerse(2, 47);
  const verse = lookup(2, 47);
  assert.ok(verse);
  assert.equal(verse.sanskrit, source.text.normalize('NFC').trim());

  const document = buildCacheDocument();
  const block = (ref: string) => document.split('\n---\n').find((part) => part.startsWith(`${ref}\n`));
  assert.match(block('2.47') ?? '', /^2\.47\nSanskrit:/);
  assert.equal(block('1.5')?.includes('Transliteration:'), false);
  assert.equal(block('1.5')?.includes('Word meanings:'), false);
  assert.equal(block('10.33')?.includes('Transliteration:'), false);
  assert.equal(block('10.33')?.includes('Word meanings:'), true);
  assert.equal(document.includes(source.transliteration.trim()), true);
});

test('the CSV supplies English and Hindi, and the theme is only the chapter colophon', () => {
  const corpus = loadCorpus();
  for (const verse of corpus.verses.values()) {
    const note = verseNote(verse.chapter, verse.verse);
    assert.ok(note, `${verse.chapter}.${verse.verse}`);
    assert.ok(note.englishTranslation.length > 12);
    assert.ok(note.hindiMeaning.length > 8);
    assert.equal(note.themes.length, 1);
  }
  const duty = verseNote(2, 47);
  assert.deepEqual(duty?.themes, ['Sankhya Yoga']);
  assert.match(duty?.englishTranslation ?? '', /work|action|fruit/i);
});

test('every verse carries an enriched summary and per-verse themes', () => {
  const corpus = loadCorpus();
  const missing = [...corpus.verses.values()]
    .filter((verse) => !verse.summary || verse.verseThemes.length === 0)
    .map((verse) => `${verse.chapter}.${verse.verse}`);
  assert.deepEqual(missing, [], 'run `npm run enrich` to fill these');
  const duty = lookup(2, 47);
  assert.ok(duty?.teaching);
  assert.ok(duty?.situations.length);
  assert.equal(lookup(1, 1)?.teaching, false);
});
