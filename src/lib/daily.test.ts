import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCorpus } from './corpus';
import { dailyPool, istDayNumber, verseOfTheDay } from './daily';
import { wrapLines } from './wrap';

test('the verse of the day is a teaching verse, fixed for the day, and changes at midnight IST', () => {
  const morning = verseOfTheDay(new Date('2026-10-06T03:00:00Z'));
  const evening = verseOfTheDay(new Date('2026-10-06T18:00:00Z'));
  const nextDay = verseOfTheDay(new Date('2026-10-06T19:00:00Z'));
  assert.ok(morning);
  assert.deepEqual(morning, evening, '03:00Z and 18:00Z are 08:30 and 23:30 IST on the same day');
  assert.notDeepEqual(morning, nextDay, '19:00Z is 00:30 IST the next day');
  const verse = loadCorpus().verses.get(`${morning.chapter}.${morning.verse}`);
  assert.ok(verse?.teaching);
  assert.ok(morning.summary);
});

test('the daily rotation shows every verse in the pool before repeating', () => {
  const pool = dailyPool();
  assert.ok(pool.length > 300);
  const start = istDayNumber(new Date('2026-01-01T06:00:00Z'));
  const seen = new Set<string>();
  for (let day = 0; day < pool.length; day += 1) {
    const verse = verseOfTheDay(new Date((start + day) * 86_400_000 + 6 * 3_600_000));
    assert.ok(verse);
    seen.add(`${verse.chapter}.${verse.verse}`);
  }
  assert.equal(seen.size, pool.length);
});

test('share-card text wraps by width and ends with an ellipsis when cut short', () => {
  const measure = (value: string) => value.length * 10;
  assert.deepEqual(wrapLines('one two three four', 100, measure), ['one two', 'three four']);
  assert.deepEqual(wrapLines('line one\nline two', 1000, measure), ['line one', 'line two']);
  const cut = wrapLines('a b c d e f g h', 30, measure, 2);
  assert.equal(cut.length, 2);
  assert.ok(cut[1].endsWith('…'));
});
