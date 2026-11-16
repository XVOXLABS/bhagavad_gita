'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { DisplayVerse } from '@/lib/corpus';
import { Lotus } from '../icons';
import { useSavedVerses, verseRef } from '../saved';
import { shareVerse } from '../share-card';
import { VerseCard, type VerseActions } from '../verse-card';
import {
  readProfile,
  PERSONA_DESCRIPTIONS,
  type DevoteeProfile,
  PROFILE_EVENT,
  defaultProfile,
} from '@/lib/profile';
import {
  readMemories,
  writeMemories,
  type CompanionMemory,
  MEMORY_CATEGORIES,
  MEMORIES_EVENT,
} from '@/lib/memory';
import { getCurrentUser, isSupabaseConfigured } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

export function MyGitaScreen() {
  const savedVerses = useSavedVerses();
  const [sharingRef, setSharingRef] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [activeTab, setActiveTab] = useState<'journey' | 'saved'>('journey');
  const [profile, setProfile] = useState<DevoteeProfile>(defaultProfile);
  const [memories, setMemories] = useState<CompanionMemory[]>([]);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    setProfile(readProfile());
    setMemories(readMemories());

    const onProfile = () => setProfile(readProfile());
    const onMemories = () => setMemories(readMemories());

    window.addEventListener(PROFILE_EVENT, onProfile);
    window.addEventListener(MEMORIES_EVENT, onMemories);

    void getCurrentUser().then(setUser);

    return () => {
      window.removeEventListener(PROFILE_EVENT, onProfile);
      window.removeEventListener(MEMORIES_EVENT, onMemories);
    };
  }, []);

  function flash(text: string) {
    setNotice(text);
    window.setTimeout(() => setNotice((current) => (current === text ? '' : current)), 3200);
  }

  function handleToggleMemory(id: string) {
    const updated = memories.map((m) => (m.id === id ? { ...m, active: !m.active } : m));
    setMemories(updated);
    writeMemories(updated);
    flash('Reflection status updated');
  }

  function handleDeleteMemory(id: string) {
    const updated = memories.filter((m) => m.id !== id);
    setMemories(updated);
    writeMemories(updated);
    flash('Reflection removed from journey');
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

  const activeCommitments = memories.filter((m) => m.category === 'commitment' && m.active).length;
  const personaInfo = PERSONA_DESCRIPTIONS[profile.persona ?? 'sakha'];

  return (
    <main className="content content-quiet">
      <section className="saved" aria-labelledby="saved-title">
        {/* Header & Devotee Sanctuary Banner */}
        <div className="saved-head journey-header">
          <div>
            <h1 id="saved-title" className="page-title">
              My Gita
            </h1>
            <p className="page-sub">
              Your personal spiritual journey & sacred scripture reflections
            </p>
          </div>

          {/* Tab Selector */}
          <div className="journey-tabs-bar" role="tablist" aria-label="My Gita sections">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'journey'}
              className={`journey-tab-btn ${activeTab === 'journey' ? 'journey-tab-active' : ''}`}
              onClick={() => setActiveTab('journey')}
            >
              <span>🕊️</span>
              <span>Spiritual Journey</span>
              {memories.length > 0 ? <span className="journey-tab-pill">{memories.length}</span> : null}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'saved'}
              className={`journey-tab-btn ${activeTab === 'saved' ? 'journey-tab-active' : ''}`}
              onClick={() => setActiveTab('saved')}
            >
              <span>📜</span>
              <span>Saved Verses</span>
              {savedVerses.saved.length > 0 ? (
                <span className="journey-tab-pill">{savedVerses.saved.length}</span>
              ) : null}
            </button>
          </div>
        </div>

        {/* TAB 1: SPIRITUAL JOURNEY TIMELINE */}
        {activeTab === 'journey' ? (
          <div className="journey-content">
            {/* Seeker Profile Card */}
            <div className="journey-profile-card">
              <div className="journey-avatar-circle">
                <span>{personaInfo.icon}</span>
              </div>
              <div className="journey-profile-details">
                <div className="journey-profile-top">
                  <h2 className="journey-devotee-name">
                    {profile.preferredName ? profile.preferredName : 'Devotee of the Gita'}
                  </h2>
                  <span className="journey-persona-badge">
                    {personaInfo.icon} Walking with Krishna as {personaInfo.label}
                  </span>
                </div>
                <p className="journey-focus-text">
                  {profile.lifeContext
                    ? `Spiritual Focus: ${profile.lifeContext}`
                    : 'Walking with Krishna on the path of inner peace, duty, and spiritual wisdom.'}
                </p>
                <div className="journey-sync-badge">
                  {user ? (
                    <span className="sync-status sync-status-cloud">
                      ☁️ Synced to Sacred Cloud ({user.email ?? 'Connected'})
                    </span>
                  ) : (
                    <span className="sync-status sync-status-device">
                      📱 On-Device Sanctuary {isSupabaseConfigured() ? '· Sign in to sync across devices' : ''}
                    </span>
                  )}
                </div>
              </div>
              <div className="journey-profile-cta">
                <Link href="/" className="btn btn-primary journey-speak-btn">
                  Speak with Krishna
                </Link>
              </div>
            </div>

            {/* Metrics Overview Cards */}
            <div className="journey-stats-grid">
              <div className="journey-stat-card">
                <span className="journey-stat-number">{memories.length}</span>
                <span className="journey-stat-label">Journey Reflections</span>
              </div>
              <div className="journey-stat-card">
                <span className="journey-stat-number">{activeCommitments}</span>
                <span className="journey-stat-label">Active Commitments</span>
              </div>
              <div className="journey-stat-card">
                <span className="journey-stat-number">{savedVerses.saved.length}</span>
                <span className="journey-stat-label">Verses Kept in Heart</span>
              </div>
            </div>

            {/* Timeline of Reflections */}
            {memories.length === 0 ? (
              <div className="empty-state journey-empty-state">
                <Lotus className="empty-lotus" />
                <h2>Your Spiritual Journey with Krishna Awaits</h2>
                <p>
                  As you speak with Krishna, your heartfelt reflections, commitments, and the wisdom revealed to you
                  will blossom into this timeline automatically.
                </p>
                <div className="empty-actions">
                  <Link href="/" className="btn btn-primary">
                    Meet Krishna Now
                  </Link>
                </div>
              </div>
            ) : (
              <div className="journey-timeline-section">
                <h3 className="journey-timeline-heading">Sacred Milestones & Reflections</h3>
                <div className="journey-timeline">
                  {memories.map((mem) => {
                    const categoryMeta = MEMORY_CATEGORIES[mem.category ?? 'life_context'];
                    const dateFormatted = new Date(mem.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    });

                    return (
                      <div
                        key={mem.id}
                        className={`journey-timeline-item ${!mem.active ? 'journey-item-completed' : ''}`}
                      >
                        <div className="journey-timeline-marker">
                          <span className="journey-marker-dot">{categoryMeta.icon}</span>
                          <span className="journey-timeline-line" />
                        </div>
                        <div className="journey-card">
                          <div className="journey-card-header">
                            <span className="journey-category-tag">
                              {categoryMeta.icon} {categoryMeta.label}
                            </span>
                            {mem.associatedVerse ? (
                              <Link
                                href={`/gita#${mem.associatedVerse}`}
                                className="journey-verse-link"
                                title={`View Gita Verse ${mem.associatedVerse}`}
                              >
                                📖 Verse {mem.associatedVerse}
                              </Link>
                            ) : null}
                            <span className="journey-date">{dateFormatted}</span>

                            <div className="journey-card-actions">
                              <button
                                type="button"
                                className="journey-status-toggle"
                                onClick={() => handleToggleMemory(mem.id)}
                                title={mem.active ? 'Mark as completed/honored' : 'Mark as active'}
                              >
                                {mem.active ? '✓ Complete' : '↺ Reopen'}
                              </button>
                              <button
                                type="button"
                                className="journey-delete-btn"
                                onClick={() => handleDeleteMemory(mem.id)}
                                title="Remove from timeline"
                                aria-label="Delete reflection"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                          <p className="journey-fact-text">{mem.fact}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* TAB 2: SAVED VERSES */
          <div className="saved-content">
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
