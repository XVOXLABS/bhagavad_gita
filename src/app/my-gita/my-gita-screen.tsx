'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { DisplayVerse } from '@/lib/corpus';
import { Lotus } from '../icons';
import { useSavedVerses, verseRef } from '../saved';
import { shareVerse } from '../share-card';
import { VerseCard, type VerseActions } from '../verse-card';

export function MyGitaScreen() {
  const savedVerses = useSavedVerses();
  const [sharingRef, setSharingRef] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  function flash(text: string) {
    setNotice(text);
    window.setTimeout(() => setNotice((current) => (current === text ? '' : current)), 3200);
  }

  function actionsFor(verse: DisplayVerse): VerseActions {
    const saved = savedVerses.isSaved(verse);
    return {
      saved,
      sharing: sharingRef === verseRef(verse),
      onToggleSave: () => {
        savedVerses.toggle(verse);
        flash(saved ? 'Removed from My Gita' : 'Saved to My Gita');
      },
      onShare: () => {
        const ref = verseRef(verse);
        setSharingRef(ref);
        void shareVerse(verse)
          .then((result) => {
            if (result === 'downloaded') flash('Image saved to your downloads');
          })
          .catch(() => flash('The image could not be created. Please try again.'))
          .finally(() => setSharingRef(null));
      },
    };
  }

  return (
    <main className="content content-quiet">
      <section className="saved" aria-labelledby="saved-title">
        <div className="saved-head">
          <div>
            <h1 id="saved-title" className="page-title">
              My Gita
            </h1>
            <p className="page-sub">
              {savedVerses.saved.length === 0
                ? 'Saved on this device'
                : savedVerses.saved.length === 1
                  ? '1 verse saved on this device'
                  : `${savedVerses.saved.length} verses saved on this device`}
            </p>
          </div>
        </div>
        {savedVerses.saved.length === 0 ? (
          <div className="empty-state">
            <Lotus className="empty-lotus" />
            <h2>No verses saved yet</h2>
            <p>Tap the bookmark on any verse that speaks to you, and it will wait for you here.</p>
            <div className="empty-actions">
              <Link href="/" className="btn btn-primary">
                Today’s verse
              </Link>
              <Link href="/gita" className="btn btn-secondary">
                Read the Gita
              </Link>
            </div>
          </div>
        ) : (
          <div className="saved-list">
            {savedVerses.saved.map((verse) => (
              <VerseCard key={verseRef(verse)} verse={verse} actions={actionsFor(verse)} />
            ))}
          </div>
        )}
      </section>
      {notice ? (
        <p className="toast" role="status">
          {notice}
        </p>
      ) : null}
    </main>
  );
}
