import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCorpus } from './corpus';
import type { VerseVectors } from './embed';
import { buildShortlist, expandQueryTerms, rankVerses, SHORTLIST_SIZE, type Situation } from './retrieve';

function fixtureVectors(target: string): VerseVectors {
  const vectors = new Map<string, Float32Array>();
  for (const verse of loadCorpus().verses.values()) {
    const ref = `${verse.chapter}.${verse.verse}`;
    vectors.set(ref, Float32Array.from(ref === target ? [1, 0, 0, 0] : [0, 1, 0, 0]));
  }
  return { model: 'fixture', dims: 4, vectors };
}

function situation(themes: Situation['themes']): Situation {
  return { intent: 'problem', replyLanguage: 'en', emotions: [], situation: '', need: '', themes, crisis: false, continuesPrevious: false };
}

test('expands everyday words into gloss terms', () => {
  const terms = expandQueryTerms('I am very fear now about my future');
  assert.ok(terms.includes('fear'));
  assert.ok(terms.includes('refuge') || terms.includes('protect') || terms.includes('death'));
});

test('keyword fallback stays small and never sends Sanskrit', () => {
  const shortlist = buildShortlist({ message: 'I feel too much stress in my work', vectors: null });
  assert.equal(shortlist.mode, 'keyword');
  assert.ok(shortlist.refs.length > 0);
  assert.ok(shortlist.refs.length <= SHORTLIST_SIZE);
  assert.ok(shortlist.document.length < 80_000);
  assert.equal(shortlist.document.includes('Sanskrit:'), false);
});

test('semantic search ranks the closest verse first', () => {
  const shortlist = buildShortlist({
    message: 'my father died and I cannot stop crying',
    queryVector: Float32Array.from([1, 0, 0, 0]),
    vectors: fixtureVectors('2.20'),
  });
  assert.equal(shortlist.mode, 'semantic');
  assert.equal(shortlist.refs[0], '2.20');
  assert.equal(shortlist.refs.length, SHORTLIST_SIZE);
});

test('without a query vector, search falls back to keywords even when verse vectors exist', () => {
  const shortlist = buildShortlist({ message: 'I am afraid', queryVector: null, vectors: fixtureVectors('2.20') });
  assert.equal(shortlist.mode, 'keyword');
});

test('matching themes lift a verse when similarity ties', () => {
  const { ranked } = rankVerses({
    message: 'x',
    situation: situation(['grief-loss']),
    queryVector: Float32Array.from([0, 1, 0, 0]),
    vectors: fixtureVectors('none'),
  });
  const top = loadCorpus().verses.get(ranked[0].ref);
  assert.ok(top?.verseThemes.includes('grief-loss'), `top verse ${ranked[0].ref} should be about grief`);
});

test('pure narrative verses are never offered', () => {
  const corpus = loadCorpus();
  const narrative = [...corpus.verses.values()]
    .filter((verse) => verse.verseThemes.length === 1 && verse.verseThemes[0] === 'narrative')
    .map((verse) => `${verse.chapter}.${verse.verse}`);
  assert.ok(narrative.includes('1.1'));
  const { ranked } = rankVerses({ message: 'x', queryVector: Float32Array.from([0, 1, 0, 0]), vectors: fixtureVectors('1.1') });
  assert.equal(ranked.some((item) => narrative.includes(item.ref)), false);
});

test('pinned earlier citations stay in the shortlist', () => {
  const { refs } = buildShortlist({ message: 'tell me more about my worry', pinnedRefs: ['2.47'], vectors: null });
  assert.ok(refs.includes('2.47'));
});
