import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { allChapters, chapterInfo, chapterVerses } from '@/lib/chapters';
import type { DisplayVerse } from '@/lib/corpus';
import { BackIcon, ChevronIcon, Lotus } from '../../icons';
import { VerseTools } from '../verse-tools';

type Params = Promise<{ chapter: string }>;

// Only the 18 chapters exist; every page is built ahead of time.
export const dynamicParams = false;

export function generateStaticParams() {
  return allChapters().map((chapter) => ({ chapter: String(chapter.number) }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const info = chapterInfo(Number((await params).chapter));
  if (!info) return {};
  return {
    title: `Chapter ${info.number}: ${info.name} · Bhagavad Gita`,
    description: `${info.meaning}. ${info.about}`,
  };
}

function sanskritLines(text: string): string {
  return text.replace(/।।\s*\d+\.\d+\s*।।/g, '॥').replace(/\n\s*\n+/g, '\n');
}

function VerseArticle({ verse }: { verse: DisplayVerse }) {
  const hasMore = verse.englishTranslation || verse.transliteration || verse.wordMeanings || verse.hindiMeaning;
  return (
    <article id={`v${verse.verse}`} className="verse-card reader-verse" lang="en">
      <header className="verse-head">
        <a href={`#v${verse.verse}`} className="reader-verse-ref">
          Verse {verse.chapter}.{verse.verse}
        </a>
        <VerseTools verse={verse} />
      </header>

      <blockquote className="sanskrit" lang="sa">
        {sanskritLines(verse.sanskrit)}
      </blockquote>

      <Lotus className="verse-lotus" />

      {verse.summary ? <p className="verse-meaning">{verse.summary}</p> : null}
      {!verse.summary && verse.englishTranslation ? <p className="verse-meaning">{verse.englishTranslation}</p> : null}

      {hasMore ? (
        <details className="verse-more">
          <summary>
            <span>Translation and word meanings</span>
            <ChevronIcon className="verse-more-chevron" />
          </summary>
          <div className="verse-more-body">
            {verse.englishTranslation && verse.summary ? (
              <div>
                <h4>Translation</h4>
                <p>{verse.englishTranslation}</p>
              </div>
            ) : null}
            {verse.transliteration ? (
              <div>
                <h4>Transliteration</h4>
                <p>{verse.transliteration}</p>
              </div>
            ) : null}
            {verse.wordMeanings ? (
              <div>
                <h4>Word meanings</h4>
                <p>{verse.wordMeanings}</p>
              </div>
            ) : null}
            {verse.hindiMeaning ? (
              <div>
                <h4>हिन्दी अर्थ</h4>
                <p lang="hi">{verse.hindiMeaning}</p>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </article>
  );
}

export default async function ChapterPage({ params }: { params: Params }) {
  const number = Number((await params).chapter);
  const info = chapterInfo(number);
  if (!info) notFound();
  const verses = chapterVerses(number);
  const previous = chapterInfo(number - 1);
  const next = chapterInfo(number + 1);

  return (
    <>
      <Link href="/gita" className="reader-back">
        <BackIcon />
        All chapters
      </Link>

      <header className="reader-hero">
        <p className="verse-kicker">Chapter {info.number}</p>
        <h1 className="reader-title">{info.name}</h1>
        <p className="reader-meaning">{info.meaning}</p>
        <p className="reader-sub">{info.about}</p>
        <Lotus className="verse-lotus" />
      </header>

      <nav className="verse-jump" aria-label={`Verses in chapter ${info.number}`}>
        <p className="section-label">{info.verseCount} verses</p>
        <ol className="verse-jump-list">
          {verses.map((verse) => (
            <li key={verse.verse}>
              <a href={`#v${verse.verse}`} aria-label={`Verse ${verse.verse}`}>
                {verse.verse}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="reader-list">
        {verses.map((verse) => (
          <VerseArticle key={verse.verse} verse={verse} />
        ))}
      </div>

      <nav className="chapter-pager" aria-label="Chapters">
        {previous ? (
          <Link href={`/gita/${previous.number}`} className="pager-link">
            <span className="pager-dir">
              <BackIcon /> Chapter {previous.number}
            </span>
            <span className="pager-name">{previous.name}</span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/gita/${next.number}`} className="pager-link pager-next">
            <span className="pager-dir">
              Chapter {next.number} <ChevronIcon />
            </span>
            <span className="pager-name">{next.name}</span>
          </Link>
        ) : null}
      </nav>
    </>
  );
}
