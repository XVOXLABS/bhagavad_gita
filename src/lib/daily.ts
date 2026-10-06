import { loadCorpus, toDisplay, verseKey, type DisplayVerse } from './corpus';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
/** A stride coprime with the pool size walks every verse once before repeating, in a scattered order. */
const STRIDE = 97;

/** Days since 1970-01-01 on the Indian calendar, so the verse changes at midnight IST. */
export function istDayNumber(now: Date): number {
  return Math.floor((now.getTime() + IST_OFFSET_MS) / 86_400_000);
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Verses that teach something and have a summary; narration and Arjuna's laments are left out. */
export function dailyPool(): string[] {
  return [...loadCorpus().verses.values()]
    .filter((verse) => verse.teaching && verse.summary && !verse.verseThemes.includes('narrative'))
    .sort((a, b) => a.id - b.id)
    .map((verse) => verseKey(verse.chapter, verse.verse));
}

export function verseOfTheDay(now = new Date()): DisplayVerse | null {
  const pool = dailyPool();
  if (pool.length === 0) return null;
  let stride = STRIDE % pool.length || 1;
  while (gcd(stride, pool.length) !== 1) stride += 1;
  const ref = pool[(istDayNumber(now) * stride) % pool.length];
  const verse = loadCorpus().verses.get(ref);
  return verse ? toDisplay(verse) : null;
}
