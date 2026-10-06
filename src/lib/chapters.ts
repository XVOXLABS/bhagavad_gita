import { loadCorpus, toDisplay, type DisplayVerse } from './corpus';
import { CHAPTER_YOGA } from './gita-csv';

export type ChapterInfo = {
  number: number;
  /** The chapter's own title from its colophon, e.g. "Karma Yoga". */
  name: string;
  /** The title in plain English. */
  meaning: string;
  /** One line on what the chapter teaches. */
  about: string;
  verseCount: number;
};

const CHAPTER_TEXT: Record<number, { meaning: string; about: string }> = {
  1: {
    meaning: 'The Sorrow of Arjuna',
    about: 'On the field of Kurukshetra, Arjuna sees his own family on both sides and lays down his bow, overcome by grief.',
  },
  2: {
    meaning: 'The Yoga of Knowledge',
    about: 'Krishna begins to teach: the Self is eternal, and one should act steadily without clinging to results.',
  },
  3: {
    meaning: 'The Yoga of Action',
    about: 'No one can stay without acting; work done as an offering, free of selfish desire, does not bind.',
  },
  4: {
    meaning: 'Knowledge, Action and Renunciation',
    about: 'Krishna reveals why He comes age after age, and how knowledge turns every action into worship.',
  },
  5: {
    meaning: 'The Yoga of Renunciation',
    about: 'Giving up and acting rightly lead to the same goal; the wise act while remaining inwardly free.',
  },
  6: {
    meaning: 'The Yoga of Meditation',
    about: 'How to sit, steady the restless mind, and become a friend to oneself through practice and detachment.',
  },
  7: {
    meaning: 'Knowledge and Realisation',
    about: 'Krishna describes His lower and higher natures, and the four kinds of people who turn to Him.',
  },
  8: {
    meaning: 'The Imperishable Absolute',
    about: 'What one remembers at the end shapes what follows; remember Krishna always and keep doing your duty.',
  },
  9: {
    meaning: 'The Royal Knowledge and Royal Secret',
    about: 'Even a leaf, a flower, fruit or water offered with love is accepted; no devotee of Krishna is ever lost.',
  },
  10: {
    meaning: 'Divine Glories',
    about: 'Krishna names His splendours in the world, so that every excellence becomes a reminder of Him.',
  },
  11: {
    meaning: 'The Vision of the Universal Form',
    about: 'Arjuna is granted divine sight and beholds the cosmic form of Krishna, then asks to see Him gentle again.',
  },
  12: {
    meaning: 'The Yoga of Devotion',
    about: 'The path of loving devotion, and the qualities of a devotee who is dear to Krishna.',
  },
  13: {
    meaning: 'The Field and the Knower of the Field',
    about: 'The body is the field, the Self is its knower; seeing the difference is true knowledge.',
  },
  14: {
    meaning: 'The Three Qualities of Nature',
    about: 'Goodness, passion and ignorance bind every being; how to recognise them and rise beyond all three.',
  },
  15: {
    meaning: 'The Supreme Person',
    about: 'The eternal tree of worldly life, and Krishna as the Supreme Person who dwells in every heart.',
  },
  16: {
    meaning: 'The Divine and the Demonic',
    about: 'The qualities that lead to freedom and those that lead to bondage; lust, anger and greed as the gates to ruin.',
  },
  17: {
    meaning: 'The Three Kinds of Faith',
    about: 'Faith, food, sacrifice, austerity and charity, each shaped by the three qualities of nature.',
  },
  18: {
    meaning: 'Freedom through Renunciation',
    about: 'The summing up of the Gita: act according to your nature, surrender to Krishna, and do not fear.',
  },
};

let cachedVerses: Map<number, DisplayVerse[]> | null = null;

function versesByChapter(): Map<number, DisplayVerse[]> {
  if (cachedVerses) return cachedVerses;
  const byChapter = new Map<number, DisplayVerse[]>();
  for (const verse of loadCorpus().verses.values()) {
    const list = byChapter.get(verse.chapter) ?? [];
    list.push(toDisplay(verse));
    byChapter.set(verse.chapter, list);
  }
  for (const list of byChapter.values()) list.sort((a, b) => a.verse - b.verse);
  cachedVerses = byChapter;
  return byChapter;
}

export function chapterInfo(number: number): ChapterInfo | null {
  const text = CHAPTER_TEXT[number];
  const verses = versesByChapter().get(number);
  if (!text || !verses) return null;
  return { number, name: CHAPTER_YOGA[number], ...text, verseCount: verses.length };
}

export function allChapters(): ChapterInfo[] {
  return Object.keys(CHAPTER_TEXT)
    .map(Number)
    .map(chapterInfo)
    .filter((chapter): chapter is ChapterInfo => chapter !== null);
}

export function chapterVerses(number: number): DisplayVerse[] {
  return versesByChapter().get(number) ?? [];
}
