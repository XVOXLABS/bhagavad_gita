import Link from 'next/link';
import type { ReactNode } from 'react';
import type { DisplayVerse } from '@/lib/corpus';
import { BookmarkIcon, ChevronIcon, Lotus, ShareIcon, StopIcon, VolumeIcon } from './icons';

export type VerseActions = {
  saved: boolean;
  sharing: boolean;
  onToggleSave: () => void;
  onShare: () => void;
  hearing?: boolean;
  onHear?: () => void;
};

export function IconButton({
  label,
  onClick,
  pressed,
  disabled,
  badge,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  badge?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`icon-btn ${className ?? ''}`}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
      {badge ? <span className="icon-badge">{badge > 99 ? '99+' : badge}</span> : null}
    </button>
  );
}

export function VerseCard({ verse, label, actions }: { verse: DisplayVerse; label?: string; actions?: VerseActions }) {
  const extra = verse.transliteration || verse.hindiMeaning || verse.wordMeanings;
  const showTranslationInline = !verse.summary && verse.englishTranslation;
  return (
    <figure className="verse-card" lang="en">
      <header className="verse-head">
        <div>
          <p className="verse-kicker">{label ?? 'Bhagavad Gita'}</p>
          <p className="verse-ref">
            <Link href={`/gita/${verse.chapter}#v${verse.verse}`} className="verse-ref-link">
              Chapter {verse.chapter} · Verse {verse.verse}
            </Link>
            {verse.themes?.[0] ? <span className="verse-yoga"> · {verse.themes[0]}</span> : null}
          </p>
        </div>
        {actions ? (
          <div className="verse-tools">
            {actions.onHear ? (
              <button
                type="button"
                className={`listen ${actions.hearing ? 'is-playing' : ''}`}
                aria-pressed={actions.hearing}
                onClick={actions.onHear}
              >
                {actions.hearing ? <StopIcon width={16} height={16} /> : <VolumeIcon width={16} height={16} />}
                {actions.hearing ? 'Stop' : 'Hear'}
              </button>
            ) : null}
            <IconButton
              label={actions.saved ? 'Remove from My Gita' : 'Save to My Gita'}
              pressed={actions.saved}
              onClick={actions.onToggleSave}
              className="icon-btn-sm"
            >
              <BookmarkIcon filled={actions.saved} />
            </IconButton>
            <IconButton
              label={actions.sharing ? 'Preparing image' : 'Share as image'}
              disabled={actions.sharing}
              onClick={actions.onShare}
              className="icon-btn-sm"
            >
              <ShareIcon />
            </IconButton>
          </div>
        ) : null}
      </header>

      <blockquote className="sanskrit" lang="sa">
        {verse.sanskrit.replace(/।।\s*\d+\.\d+\s*।।/g, '॥').replace(/\n\s*\n+/g, '\n')}
      </blockquote>

      <Lotus className="verse-lotus" />

      {verse.summary ? <p className="verse-meaning">{verse.summary}</p> : null}
      {showTranslationInline ? <p className="verse-meaning">{verse.englishTranslation}</p> : null}

      {(verse.englishTranslation && !showTranslationInline) || extra ? (
        <details className="verse-more">
          <summary>
            <span>Translation and word meanings</span>
            <ChevronIcon className="verse-more-chevron" />
          </summary>
          <div className="verse-more-body">
            {verse.englishTranslation && !showTranslationInline ? (
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
            {verse.hindiMeaning ? (
              <div>
                <h4>Hindi</h4>
                <p lang="hi">{verse.hindiMeaning}</p>
              </div>
            ) : null}
            {verse.wordMeanings ? (
              <div>
                <h4>Word meanings</h4>
                <p>{verse.wordMeanings}</p>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </figure>
  );
}

/** Spoken line for Hear on Today: reference plus the short meaning, not generated Sanskrit. */
export function verseToSpeak(verse: DisplayVerse): string {
  const meaning = verse.summary || verse.englishTranslation || '';
  return `Chapter ${verse.chapter}, verse ${verse.verse}. ${meaning}`.trim();
}
