'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect, type FormEvent } from 'react';
import type { DisplayVerse } from '@/lib/corpus';
import { BookmarkIcon, ChevronIcon, Lotus, PeacockFeather, ShareIcon, StopIcon, VolumeIcon } from './icons';
import { useSavedVerses, verseRef } from './saved';
import { shareVerse } from './share-card';
import { stageTalkDraft } from './talk-handoff';
import { useKrishnaVoice } from './use-speech';
import { IconButton, verseToSpeak } from './verse-card';

function getTodayDateString(): string {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date());
  } catch {
    return 'Today’s Darshan';
  }
}

export function TodayScreen({ daily }: { daily: DisplayVerse | null }) {
  const router = useRouter();
  const savedVerses = useSavedVerses();
  const voice = useKrishnaVoice(false);
  const [heavy, setHeavy] = useState('');
  const [sharing, setSharing] = useState(false);
  const [notice, setNotice] = useState('');
  const [todayDate, setTodayDate] = useState<string>('');

  useEffect(() => {
    setTodayDate(getTodayDateString());
  }, []);

  function flash(text: string) {
    setNotice(text);
    window.setTimeout(() => setNotice((current) => (current === text ? '' : current)), 3200);
  }

  const saved = daily ? savedVerses.isSaved(daily) : false;
  const hearing = daily ? voice.speakingId === verseRef(daily) : false;

  const handleHear = voice.supported && daily
    ? () => {
        if (hearing) voice.stop();
        else voice.speak(verseRef(daily), verseToSpeak(daily));
      }
    : undefined;

  const handleToggleSave = () => {
    if (!daily) return;
    savedVerses.toggle(daily);
    flash(saved ? 'Removed from My Gita' : 'Saved to My Gita');
  };

  const handleShare = () => {
    if (!daily) return;
    setSharing(true);
    void shareVerse(daily)
      .then((result) => {
        if (result === 'downloaded') flash('Image saved to your downloads');
      })
      .catch(() => flash('The image could not be created. Please try again.'))
      .finally(() => setSharing(false));
  };

  function openTalk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (heavy.trim()) {
      stageTalkDraft(heavy);
    }
    router.push('/talk?today=1');
  }

  function handleChipClick(chipText: string) {
    setHeavy(chipText);
    stageTalkDraft(chipText);
    router.push('/talk?today=1');
  }

  const reflectionChips = [
    'How do I apply this verse in my life today?',
    daily?.themes?.[0] ? `What is the deeper essence of ${daily.themes[0]}?` : 'Explain this verse in simpler words.',
    'What should my spiritual focus be today?',
    'Krishna, help me find peace amidst daily chaos.',
  ];

  const extra = daily ? daily.transliteration || daily.hindiMeaning || daily.wordMeanings : null;

  return (
    <main className="content content-quiet">
      <div className="home today-altar-container">
        {/* Compact, Atmospheric Sacred Header */}
        <section className="today-hero">
          <div className="today-date-badge">
            <Lotus className="today-badge-lotus" />
            <span>{todayDate || 'Today’s Sacred Reflection'}</span>
          </div>
          <h1 className="today-hero-title">A Verse for This Day</h1>
          <p className="today-hero-sub">
            Pause, listen, and reflect. Let timeless wisdom illuminate your thoughts and actions today.
          </p>
        </section>

        {/* Sacred Altar Verse Card */}
        {daily ? (
          <article className="today-altar-card" lang="en">
            <header className="today-card-head">
              <div>
                <span className="today-kicker">
                  <span className="kicker-sparkle" aria-hidden="true">✨</span> Today’s Verse
                </span>
                <p className="today-verse-ref">
                  <Link href={`/gita/${daily.chapter}#v${daily.verse}`} className="verse-ref-link">
                    Chapter {daily.chapter} · Verse {daily.verse}
                  </Link>
                  {daily.themes?.[0] ? <span className="verse-yoga"> · {daily.themes[0]}</span> : null}
                </p>
              </div>

              <div className="verse-tools today-tools">
                {handleHear ? (
                  <button
                    type="button"
                    className={`listen ${hearing ? 'is-playing' : ''}`}
                    aria-pressed={hearing}
                    onClick={handleHear}
                  >
                    {hearing ? <StopIcon width={16} height={16} /> : <VolumeIcon width={16} height={16} />}
                    {hearing ? 'Stop Chanting' : 'Hear Chant'}
                  </button>
                ) : null}

                <IconButton
                  label={saved ? 'Remove from My Gita' : 'Save to My Gita'}
                  pressed={saved}
                  onClick={handleToggleSave}
                  className="icon-btn-sm"
                >
                  <BookmarkIcon filled={saved} />
                </IconButton>

                <IconButton
                  label={sharing ? 'Preparing image' : 'Share as image'}
                  disabled={sharing}
                  onClick={handleShare}
                  className="icon-btn-sm"
                >
                  <ShareIcon />
                </IconButton>
              </div>
            </header>

            {/* Sacred Sanskrit Shloka */}
            <blockquote className="sanskrit today-sanskrit" lang="sa">
              {daily.sanskrit.replace(/।।\s*\d+\.\d+\s*।।/g, '॥').replace(/\n\s*\n+/g, '\n')}
            </blockquote>

            {/* Ornate Divider with Centered Lotus */}
            <div className="sacred-altar-divider" aria-hidden="true">
              <span className="divider-line" />
              <Lotus className="divider-lotus" />
              <span className="divider-line" />
            </div>

            {/* English Translation */}
            {daily.englishTranslation ? (
              <p className="today-verse-translation">
                “{daily.englishTranslation}”
              </p>
            ) : daily.summary ? (
              <p className="today-verse-translation">“{daily.summary}”</p>
            ) : null}

            {/* Daily Sadhana & Practical Contemplation */}
            {daily.summary && daily.englishTranslation ? (
              <div className="today-sadhana-box">
                <div className="sadhana-header">
                  <span className="sadhana-icon" aria-hidden="true">🪔</span>
                  <span className="sadhana-title">Daily Contemplation & Sadhana</span>
                </div>
                <p className="sadhana-body">{daily.summary}</p>
                {daily.verseThemes && daily.verseThemes.length > 0 ? (
                  <div className="sadhana-tags">
                    {daily.verseThemes.slice(0, 4).map((theme) => (
                      <span key={theme} className="sadhana-tag">
                        #{theme}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Deeper Word Meanings & Transliteration */}
            {extra ? (
              <details className="verse-more today-verse-more">
                <summary>
                  <span>Transliteration & word-by-word meanings</span>
                  <ChevronIcon className="verse-more-chevron" />
                </summary>
                <div className="verse-more-body">
                  {daily.transliteration ? (
                    <div>
                      <h4>Transliteration</h4>
                      <p>{daily.transliteration}</p>
                    </div>
                  ) : null}
                  {daily.hindiMeaning ? (
                    <div>
                      <h4>Hindi</h4>
                      <p lang="hi">{daily.hindiMeaning}</p>
                    </div>
                  ) : null}
                  {daily.wordMeanings ? (
                    <div>
                      <h4>Word meanings</h4>
                      <p>{daily.wordMeanings}</p>
                    </div>
                  ) : null}
                </div>
              </details>
            ) : null}
          </article>
        ) : (
          <div className="empty-state">
            <Lotus className="empty-lotus" />
            <h2>Today’s verse is not available</h2>
            <p>You can still speak with Krishna, or begin reading from Chapter 1.</p>
          </div>
        )}

        {/* Reflect with Krishna (Connected Conversation Bridge) */}
        <section className="today-reflect-card">
          <div className="reflect-card-header">
            <div className="reflect-emblem" aria-hidden="true">
              <span className="reflect-halo" />
              <PeacockFeather className="reflect-feather" />
            </div>
            <div>
              <h2 className="reflect-card-title">Reflect with Krishna</h2>
              <p className="reflect-card-sub">
                Ask how today’s verse speaks to your current thoughts, work, or emotions.
              </p>
            </div>
          </div>

          <div className="reflect-chips-container">
            <p className="reflect-chips-label">Tap an inquiry to ask Krishna:</p>
            <div className="reflect-chips-grid">
              {reflectionChips.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="reflect-chip-btn"
                  onClick={() => handleChipClick(chip)}
                >
                  <span className="chip-text">{chip}</span>
                  <span className="chip-arrow" aria-hidden="true">→</span>
                </button>
              ))}
            </div>
          </div>

          <form className="reflect-form" onSubmit={openTalk}>
            <label htmlFor="heavy" className="sr-only">
              Your reflection or question for Krishna
            </label>
            <div className="reflect-textarea-wrap">
              <textarea
                id="heavy"
                name="heavy"
                rows={2}
                maxLength={2000}
                value={heavy}
                placeholder="Or write your own question about this verse, or what is on your heart today…"
                onChange={(event) => setHeavy(event.target.value)}
              />
            </div>
            <div className="reflect-form-footer">
              <button type="submit" className="btn btn-primary reflect-submit-btn">
                <span>Speak with Krishna</span>
                <span className="btn-arrow" aria-hidden="true">→</span>
              </button>
            </div>
          </form>
        </section>

        {/* Chapter Navigation Link */}
        {daily ? (
          <nav className="today-footer-nav" aria-label="Chapter navigation">
            <Link href={`/gita/${daily.chapter}`} className="today-chapter-pill">
              <span>Read Full Chapter {daily.chapter} ({daily.themes?.[0] || 'Bhagavad Gita'})</span>
              <span className="nav-arrow" aria-hidden="true">→</span>
            </Link>
            <Link href="/gita/1" className="today-begin-sublink">
              Begin from Chapter 1
            </Link>
          </nav>
        ) : null}
      </div>

      {notice ? (
        <p className="toast" role="status">
          {notice}
        </p>
      ) : null}
    </main>
  );
}
