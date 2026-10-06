'use client';

import { useState } from 'react';
import type { DisplayVerse } from '@/lib/corpus';
import { BookmarkIcon, LinkIcon, ShareIcon } from '../icons';
import { useSavedVerses } from '../saved';
import { shareVerse } from '../share-card';

/** Save, share and copy-link for one verse on the reading pages. */
export function VerseTools({ verse }: { verse: DisplayVerse }) {
  const { isSaved, toggle } = useSavedVerses();
  const [sharing, setSharing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const saved = isSaved(verse);

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2200);
  };

  const share = async () => {
    setSharing(true);
    try {
      const result = await shareVerse(verse);
      if (result === 'downloaded') flash('Image saved');
    } catch {
      flash('Could not create the image');
    } finally {
      setSharing(false);
    }
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/gita/${verse.chapter}#v${verse.verse}`;
    try {
      await navigator.clipboard.writeText(url);
      flash('Link copied');
    } catch {
      flash('Could not copy the link');
    }
  };

  return (
    <div className="verse-tools">
      <button
        type="button"
        className="icon-btn icon-btn-sm"
        aria-label={saved ? 'Remove from My Gita' : 'Save to My Gita'}
        title={saved ? 'Remove from My Gita' : 'Save to My Gita'}
        aria-pressed={saved}
        onClick={() => {
          toggle(verse);
          flash(saved ? 'Removed from My Gita' : 'Saved to My Gita');
        }}
      >
        <BookmarkIcon filled={saved} />
      </button>
      <button
        type="button"
        className="icon-btn icon-btn-sm"
        aria-label={sharing ? 'Preparing image' : 'Share as image'}
        title={sharing ? 'Preparing image' : 'Share as image'}
        disabled={sharing}
        onClick={() => void share()}
      >
        <ShareIcon />
      </button>
      <button
        type="button"
        className="icon-btn icon-btn-sm"
        aria-label="Copy link to this verse"
        title="Copy link to this verse"
        onClick={() => void copyLink()}
      >
        <LinkIcon />
      </button>
      {toast ? (
        <p className="toast" role="status">
          {toast}
        </p>
      ) : null}
    </div>
  );
}
