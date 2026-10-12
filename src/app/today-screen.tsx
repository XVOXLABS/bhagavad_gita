'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { DisplayVerse } from '@/lib/corpus';
import { Lotus, PeacockFeather } from './icons';
import { useSavedVerses, verseRef } from './saved';
import { shareVerse } from './share-card';
import { stageTalkDraft } from './talk-handoff';
import { useKrishnaVoice } from './use-speech';
import { VerseCard, verseToSpeak, type VerseActions } from './verse-card';

export function TodayScreen({ daily }: { daily: DisplayVerse | null }) {
  const router = useRouter();
  const savedVerses = useSavedVerses();
  const voice = useKrishnaVoice(false);
  const [heavy, setHeavy] = useState('');
  const [sharing, setSharing] = useState(false);
  const [notice, setNotice] = useState('');

  function flash(text: string) {
    setNotice(text);
    window.setTimeout(() => setNotice((current) => (current === text ? '' : current)), 3200);
  }

  function actionsFor(verse: DisplayVerse): VerseActions {
    const saved = savedVerses.isSaved(verse);
    const hearing = voice.speakingId === verseRef(verse);
    return {
      saved,
      sharing,
      hearing,
      onHear: voice.supported
        ? () => {
            if (hearing) voice.stop();
            else voice.speak(verseRef(verse), verseToSpeak(verse));
          }
        : undefined,
      onToggleSave: () => {
        savedVerses.toggle(verse);
        flash(saved ? 'Removed from My Gita' : 'Saved to My Gita');
      },
      onShare: () => {
        setSharing(true);
        void shareVerse(verse)
          .then((result) => {
            if (result === 'downloaded') flash('Image saved to your downloads');
          })
          .catch(() => flash('The image could not be created. Please try again.'))
          .finally(() => setSharing(false));
      },
    };
  }

  function openTalk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    stageTalkDraft(heavy);
    router.push('/talk?today=1');
  }

  return (
    <main className="content content-quiet">
      <div className="home">
        <section className="hero">
          <div className="hero-emblem" aria-hidden="true">
            <span className="hero-halo" />
            <PeacockFeather className="hero-feather" />
          </div>
          <p className="hero-kicker">Today</p>
          <h1 className="hero-title">A verse for this day</h1>
          <p className="hero-sub">Read it, hear it, or keep it. If something is heavy, Krishna will meet you there.</p>
        </section>

        {daily ? (
          <VerseCard verse={daily} label="Today’s verse" actions={actionsFor(daily)} />
        ) : (
          <div className="empty-state">
            <Lotus className="empty-lotus" />
            <h2>Today’s verse is not available</h2>
            <p>You can still speak, or begin reading from the first chapter.</p>
          </div>
        )}

        <form className="today-ask" onSubmit={openTalk}>
          <label htmlFor="heavy">What is heavy today?</label>
          <textarea
            id="heavy"
            name="heavy"
            rows={2}
            maxLength={2000}
            value={heavy}
            placeholder="A fear, a duty, a grief, a quarrel…"
            onChange={(event) => setHeavy(event.target.value)}
          />
          <button type="submit" className="btn btn-primary">
            Speak with Krishna
          </button>
        </form>

        <p className="today-begin">
          <Link href="/gita/1">Begin with Chapter 1</Link>
        </p>
      </div>

      {notice ? (
        <p className="toast" role="status">
          {notice}
        </p>
      ) : null}
    </main>
  );
}
