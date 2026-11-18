'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { DisplayVerse } from '@/lib/corpus';
import { Lotus } from '../icons';
import { useSavedVerses, verseRef } from '../saved';
import { shareVerse } from '../share-card';
import { useKrishnaVoice } from '../use-speech';
import { VerseCard, type VerseActions, verseToSpeak } from '../verse-card';

type ThemeFilter = {
  id: string;
  label: string;
  icon: string;
  matches: (verse: DisplayVerse) => boolean;
};

const THEME_FILTERS: ThemeFilter[] = [
  {
    id: 'all',
    label: 'All Verses',
    icon: '📜',
    matches: () => true,
  },
  {
    id: 'peace',
    label: 'Inner Peace & Mind',
    icon: '🌊',
    matches: (v) =>
      v.verseThemes.some((t) =>
        ['peace-equanimity', 'mind-discipline', 'fear-anxiety', 'anger', 'grief-loss'].includes(t),
      ) ||
      /peace|mind|calm|still|quiet|fear|anxiety|anger|equanimity/i.test(
        `${v.summary} ${v.englishTranslation}`,
      ),
  },
  {
    id: 'duty',
    label: 'Action & Duty',
    icon: '⚖️',
    matches: (v) =>
      v.verseThemes.some((t) =>
        ['duty-action', 'results-detachment', 'selfless-service', 'purpose-own-path'].includes(t),
      ) ||
      /action|duty|work|karma|fruits|result|deed/i.test(
        `${v.summary} ${v.englishTranslation}`,
      ),
  },
  {
    id: 'devotion',
    label: 'Devotion & Trust',
    icon: '🪷',
    matches: (v) =>
      v.verseThemes.some((t) =>
        ['devotion-surrender', 'faith-trust', 'divine-nature'].includes(t),
      ) ||
      /devotion|surrender|faith|trust|love|bhakti|refuge|krishna|divine/i.test(
        `${v.summary} ${v.englishTranslation}`,
      ),
  },
  {
    id: 'wisdom',
    label: 'Soul & Wisdom',
    icon: '✨',
    matches: (v) =>
      v.verseThemes.some((t) =>
        ['self-soul', 'wisdom-knowledge', 'death-impermanence'].includes(t),
      ) ||
      /soul|eternal|knowledge|wisdom|impermanence|truth|self/i.test(
        `${v.summary} ${v.englishTranslation}`,
      ),
  },
];

export function MyGitaScreen() {
  const savedVerses = useSavedVerses();
  const voice = useKrishnaVoice(false, false);
  const [sharingRef, setSharingRef] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTheme, setActiveTheme] = useState('all');

  function flash(text: string) {
    setNotice(text);
    window.setTimeout(() => setNotice((current) => (current === text ? '' : current)), 3200);
  }

  function actionsFor(verse: DisplayVerse): VerseActions {
    const saved = savedVerses.isSaved(verse);
    const ref = verseRef(verse);
    const hearing = voice.speakingId === ref;

    return {
      saved,
      sharing: sharingRef === ref,
      hearing,
      onHear: voice.supported
        ? () => {
          if (hearing) voice.stop();
          else voice.speak(ref, verseToSpeak(verse));
        }
        : undefined,
      onToggleSave: () => {
        savedVerses.toggle(verse);
        flash(saved ? 'Removed from My Gita' : 'Saved to My Gita');
      },
      onShare: () => {
        setSharingRef(ref);
        void shareVerse(verse)
          .then((result) => {
            if (result === 'downloaded') flash('Image saved to downloads');
          })
          .catch(() => flash('Could not create image. Please try again.'))
          .finally(() => setSharingRef(null));
      },
    };
  }

  const allSaved = savedVerses.saved;

  const filteredVerses = useMemo(() => {
    let result = allSaved;

    // 1. Theme Filter
    if (activeTheme !== 'all') {
      const filter = THEME_FILTERS.find((f) => f.id === activeTheme);
      if (filter) {
        result = result.filter(filter.matches);
      }
    }

    // 2. Search Query Filter
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      result = result.filter((v) => {
        const refStr = `${v.chapter}.${v.verse}`;
        const chapterStr = `chapter ${v.chapter}`;
        const verseStr = `verse ${v.verse}`;
        const sanskrit = v.sanskrit.toLowerCase();
        const translit = (v.transliteration ?? '').toLowerCase();
        const translation = (v.englishTranslation ?? '').toLowerCase();
        const summary = (v.summary ?? '').toLowerCase();
        const wordMeanings = (v.wordMeanings ?? '').toLowerCase();

        return (
          refStr.includes(query) ||
          chapterStr.includes(query) ||
          verseStr.includes(query) ||
          sanskrit.includes(query) ||
          translit.includes(query) ||
          translation.includes(query) ||
          summary.includes(query) ||
          wordMeanings.includes(query)
        );
      });
    }

    return result;
  }, [allSaved, activeTheme, searchQuery]);

  const hasMultipleVerses = allSaved.length >= 3;

  return (
    <main className="content content-quiet">
      <section className="saved my-gita-treasury" aria-labelledby="treasury-title">
        {/* Minimalist Sanctuary Header */}
        <div className="treasury-header">
          <div className="treasury-title-group">
            <div className="treasury-badge-row">
              <span className="treasury-count-pill">
                {allSaved.length} {allSaved.length === 1 ? 'Verse Kept' : 'Verses Kept in Heart'}
              </span>
            </div>
            <h1 id="treasury-title" className="page-title treasury-title">
              My Gita
            </h1>
            <p className="page-sub treasury-sub">
              Your personal sanctuary of sacred verses to contemplate, chant, and cherish.
            </p>
          </div>
        </div>

        {/* Search & Theme Filter Strip (only shown when user has 3+ saved verses or has active search) */}
        {hasMultipleVerses || searchQuery ? (
          <div className="treasury-controls">
            <div className="treasury-search-wrapper">
              <span className="treasury-search-icon" aria-hidden="true">
                🔍
              </span>
              <input
                type="search"
                className="treasury-search-input"
                placeholder="Search by keyword, meaning, or chapter (e.g. 2.47, peace, duty)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search saved verses"
              />
              {searchQuery ? (
                <button
                  type="button"
                  className="treasury-search-clear"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                >
                  ✕
                </button>
              ) : null}
            </div>

            {hasMultipleVerses ? (
              <div className="treasury-theme-pills" role="tablist" aria-label="Filter verses by theme">
                {THEME_FILTERS.map((theme) => {
                  const count =
                    theme.id === 'all'
                      ? allSaved.length
                      : allSaved.filter(theme.matches).length;
                  if (theme.id !== 'all' && count === 0) return null;

                  const isActive = activeTheme === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className={`treasury-pill-btn ${isActive ? 'treasury-pill-active' : ''}`}
                      onClick={() => setActiveTheme(theme.id)}
                    >
                      <span className="treasury-pill-icon">{theme.icon}</span>
                      <span>{theme.label}</span>
                      <span className="treasury-pill-count">{count}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Content: List of Saved Verses OR Serene Empty State */}
        {allSaved.length === 0 ? (
          <div className="empty-state treasury-empty-state">
            <Lotus className="empty-lotus treasury-empty-lotus" />
            <h2 className="treasury-empty-heading">Your Sacred Treasury Awaits</h2>
            <p className="treasury-empty-text">
              Whenever a verse touches your heart while speaking with Krishna or reading the scripture,
              tap the bookmark icon to keep it here in your personal sanctuary.
            </p>
            <div className="empty-actions treasury-empty-actions">
              <Link href="/" className="btn btn-primary treasury-explore-btn">
                <span>🌸</span>
                <span>Today’s Verse</span>
              </Link>
              <Link href="/gita" className="btn btn-secondary treasury-explore-btn">
                <span>📖</span>
                <span>Read the Gita</span>
              </Link>
            </div>
          </div>
        ) : filteredVerses.length === 0 ? (
          <div className="treasury-no-results">
            <p>No saved verses match your search or filter.</p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSearchQuery('');
                setActiveTheme('all');
              }}
            >
              Show all saved verses
            </button>
          </div>
        ) : (
          <div className="saved-list treasury-list">
            {filteredVerses.map((verse) => (
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
