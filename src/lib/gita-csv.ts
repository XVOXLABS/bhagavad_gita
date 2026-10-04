import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Names taken from the colophon that closes each chapter
 * (…yogo nāma … 'dhyāyaḥ). This is the chapter's own title, not a tag guessed for one verse.
 */
export const CHAPTER_YOGA: Record<number, string> = {
  1: 'Arjuna Vishada Yoga',
  2: 'Sankhya Yoga',
  3: 'Karma Yoga',
  4: 'Jnana Karma Sannyasa Yoga',
  5: 'Karma Sannyasa Yoga',
  6: 'Dhyana Yoga',
  7: 'Jnana Vijnana Yoga',
  8: 'Akshara Brahma Yoga',
  9: 'Raja Vidya Raja Guhya Yoga',
  10: 'Vibhuti Yoga',
  11: 'Vishvarupa Darshana Yoga',
  12: 'Bhakti Yoga',
  13: 'Kshetra Kshetrajna Vibhaga Yoga',
  14: 'Gunatraya Vibhaga Yoga',
  15: 'Purushottama Yoga',
  16: 'Daivasura Sampad Vibhaga Yoga',
  17: 'Shraddhatraya Vibhaga Yoga',
  18: 'Moksha Sannyasa Yoga',
};

export type CsvVerse = {
  chapter: number;
  verse: number;
  english: string;
  hindi: string;
  chapterYoga: string;
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += char;
    } else if (char === '"') inQuotes = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') field += char;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((item) => item.some((cell) => cell.trim()));
}

function cleanEnglish(value: string): string {
  return value
    .replace(/^\d+\.\d+\.?\s*/, '')
    .replace(/^"+|"+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanHindi(value: string): string {
  return value
    .replace(/^।।\d+\.\d+।।/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

let cached: Map<string, CsvVerse> | null = null;

export function loadGitaCsv(): Map<string, CsvVerse> {
  if (cached) return cached;
  const text = readFileSync(path.join(process.cwd(), 'Bhagwad_Gita.csv'), 'utf8');
  const rows = parseCsv(text);
  const header = rows[0] ?? [];
  const index = Object.fromEntries(header.map((name, position) => [name, position]));
  const verses = new Map<string, CsvVerse>();
  for (const row of rows.slice(1)) {
    const chapter = Number(row[index.Chapter]);
    const verse = Number(row[index.Verse]);
    if (!Number.isInteger(chapter) || !Number.isInteger(verse)) continue;
    verses.set(`${chapter}.${verse}`, {
      chapter,
      verse,
      english: cleanEnglish(row[index.EngMeaning] ?? ''),
      hindi: cleanHindi(row[index.HinMeaning] ?? ''),
      chapterYoga: CHAPTER_YOGA[chapter] ?? '',
    });
  }
  cached = verses;
  return verses;
}
