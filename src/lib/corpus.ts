import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadEnriched } from './enrichment';
import { loadGitaCsv } from './gita-csv';

export type WithheldField = 'transliteration' | 'wordMeanings';

export type DisplayVerse = {
  chapter: number;
  verse: number;
  sanskrit: string;
  transliteration: string | null;
  wordMeanings: string | null;
  englishTranslation: string | null;
  hindiMeaning: string | null;
  summary: string | null;
  /** Chapter title from the colophon. */
  themes: string[];
  /** Per-verse theme ids from verse-enriched.json. */
  verseThemes: string[];
};

export type CorpusVerse = DisplayVerse & {
  id: number;
  withheld: WithheldField[];
  situations: string[];
  notFor: string[];
  teaching: boolean;
};

type SourceRecord = {
  chapter_number: number;
  verse_number: number;
  id: number;
  text: string;
  transliteration: string;
  word_meanings: string;
};

/**
 * Latin fields that do not match the Sanskrit of that verse.
 * The source file is never edited. Withheld strings stay out of the prompt and the UI.
 */
const WITHHELD_BY_REF: Record<string, WithheldField[]> = {
  '1.5': ['transliteration', 'wordMeanings'],
  '1.6': ['transliteration', 'wordMeanings'],
  '10.33': ['transliteration'],
  '11.19': ['transliteration', 'wordMeanings'],
};

export type Corpus = {
  verses: Map<string, CorpusVerse>;
  sha256: string;
  verseCount: number;
  chapterCount: number;
  duplicateKeys: number;
  withheldFieldCount: number;
  flaggedRefs: string[];
};

export function verseKey(chapter: number, verse: number): string {
  return `${chapter}.${verse}`;
}

export function verseJsonPath(): string {
  return path.join(process.cwd(), 'verse.json');
}

let cached: Corpus | null = null;

export function loadCorpus(): Corpus {
  if (cached) return cached;

  const raw = readFileSync(verseJsonPath());
  const sha256 = createHash('sha256').update(raw).digest('hex');
  const records = JSON.parse(raw.toString('utf8')) as SourceRecord[];
  const verses = new Map<string, CorpusVerse>();
  const chapters = new Set<number>();
  let duplicateKeys = 0;
  let withheldFieldCount = 0;

  for (const record of records) {
    const key = verseKey(record.chapter_number, record.verse_number);
    if (verses.has(key)) duplicateKeys += 1;
    chapters.add(record.chapter_number);
    const withheld = WITHHELD_BY_REF[key] ?? [];
    withheldFieldCount += withheld.length;
    const note = verseNote(record.chapter_number, record.verse_number);
    const enriched = loadEnriched().get(key);
    verses.set(key, {
      id: record.id,
      chapter: record.chapter_number,
      verse: record.verse_number,
      sanskrit: record.text.normalize('NFC').trim(),
      transliteration: withheld.includes('transliteration')
        ? null
        : record.transliteration.normalize('NFC').trim(),
      wordMeanings: withheld.includes('wordMeanings')
        ? null
        : record.word_meanings.normalize('NFC').trim(),
      englishTranslation: note?.englishTranslation ?? null,
      hindiMeaning: note?.hindiMeaning ?? null,
      summary: enriched?.summary ?? null,
      themes: note?.themes ?? [],
      verseThemes: enriched?.themes ?? [],
      situations: enriched?.situations ?? [],
      notFor: enriched?.notFor ?? [],
      teaching: enriched?.teaching ?? true,
      withheld,
    });
  }

  cached = {
    verses,
    sha256,
    verseCount: records.length,
    chapterCount: chapters.size,
    duplicateKeys,
    withheldFieldCount,
    flaggedRefs: ['18.78'],
  };
  return cached;
}

export function lookup(chapter: number, verse: number): CorpusVerse | undefined {
  return loadCorpus().verses.get(verseKey(chapter, verse));
}

export type VerseNote = {
  themes: string[];
  englishTranslation: string;
  hindiMeaning: string;
};

let notes: Map<string, VerseNote> | null = null;

export function verseNote(chapter: number, verse: number): VerseNote | undefined {
  if (!notes) {
    notes = new Map();
    for (const [key, item] of loadGitaCsv()) {
      notes.set(key, {
        themes: item.chapterYoga ? [item.chapterYoga] : [],
        englishTranslation: item.english,
        hindiMeaning: item.hindi,
      });
    }
  }
  return notes.get(verseKey(chapter, verse));
}

export function toDisplay(verse: CorpusVerse): DisplayVerse {
  return {
    chapter: verse.chapter,
    verse: verse.verse,
    sanskrit: verse.sanskrit,
    transliteration: verse.transliteration,
    wordMeanings: verse.wordMeanings,
    englishTranslation: verse.englishTranslation,
    hindiMeaning: verse.hindiMeaning,
    summary: verse.summary,
    themes: verse.themes,
    verseThemes: verse.verseThemes,
  };
}

/** Corpus text sent to the model. Quarantined fields are omitted. */
export function buildCacheDocument(corpus = loadCorpus()): string {
  const ordered = [...corpus.verses.values()].sort((a, b) => a.id - b.id);
  return ordered
    .map((verse) => {
      const lines = [`${verse.chapter}.${verse.verse}`, `Sanskrit: ${verse.sanskrit}`];
      if (verse.transliteration) lines.push(`Transliteration: ${verse.transliteration}`);
      if (verse.wordMeanings) lines.push(`Word meanings: ${verse.wordMeanings}`);
      return lines.join('\n');
    })
    .join('\n---\n');
}
