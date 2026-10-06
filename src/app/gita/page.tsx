import type { Metadata } from 'next';
import Link from 'next/link';
import { allChapters } from '@/lib/chapters';
import { ChevronIcon, Lotus } from '../icons';

export const metadata: Metadata = {
  title: 'Bhagavad Gita · All 18 chapters · Speak with Krishna',
  description: 'Read the Bhagavad Gita chapter by chapter: Sanskrit, meaning, translation and word meanings for every verse.',
};

export default function ChaptersPage() {
  const chapters = allChapters();
  const verseTotal = chapters.reduce((sum, chapter) => sum + chapter.verseCount, 0);

  return (
    <>
      <header className="reader-hero">
        <p className="verse-kicker">श्रीमद्भगवद्गीता</p>
        <h1 className="reader-title">The Bhagavad Gita</h1>
        <p className="reader-sub">
          {chapters.length} chapters · {verseTotal} verses. Krishna&apos;s words to Arjuna, in Sanskrit with their meaning.
        </p>
        <Lotus className="verse-lotus" />
      </header>

      <ol className="chapter-grid">
        {chapters.map((chapter) => (
          <li key={chapter.number}>
            <Link href={`/gita/${chapter.number}`} className="chapter-card">
              <span className="chapter-num" aria-hidden="true">
                {chapter.number}
              </span>
              <span className="chapter-body">
                <span className="chapter-kicker">
                  Chapter {chapter.number} · {chapter.verseCount} verses
                </span>
                <span className="chapter-name">{chapter.name}</span>
                <span className="chapter-meaning">{chapter.meaning}</span>
                <span className="chapter-about">{chapter.about}</span>
              </span>
              <ChevronIcon className="chapter-chevron" />
            </Link>
          </li>
        ))}
      </ol>
    </>
  );
}
