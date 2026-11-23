'use client';

import { useState, useEffect, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  defaultProfile,
  readProfile,
  writeProfile,
  PERSONA_DESCRIPTIONS,
  type CompanionPersona,
  type DevoteeProfile,
  PROFILE_EVENT,
} from '@/lib/profile';
import {
  getCurrentUser,
  getSupabase,
  isSupabaseConfigured,
  signInWithEmail,
  signInWithGoogle,
  signOut,
} from '@/lib/supabase';
import {
  syncUserData,
  isAutoSyncEnabled,
  setAutoSyncEnabled,
  getLastSyncedAt,
  formatLastSynced,
} from '@/lib/sync';
import { useAmbientSound } from '@/lib/ambient-sound';
import { readPref, writePref } from './use-speech';

const MIC_LANG_KEY = 'gita.micLang';
const MIC_LANGS = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'hi-IN', label: 'Hindi (हिंदी)' },
  { code: 'ta-IN', label: 'Tamil (தமிழ்)' },
  { code: 'te-IN', label: 'Telugu (తెలుగు)' },
  { code: 'kn-IN', label: 'Kannada (ಕನ್ನಡ)' },
  { code: 'ml-IN', label: 'Malayalam (മലയാളം)' },
  { code: 'mr-IN', label: 'Marathi (मराठी)' },
  { code: 'bn-IN', label: 'Bengali (বাংলা)' },
  { code: 'gu-IN', label: 'Gujarati (ગુજરાતી)' },
  { code: 'pa-IN', label: 'Punjabi (ਪੰਜਾਬੀ)' },
];

export function getDevoteeDisplayName(profile: DevoteeProfile, user: User | null): string {
  if (profile.preferredName?.trim()) {
    return profile.preferredName.trim();
  }
  const metaName = user?.user_metadata?.full_name || user?.user_metadata?.name;
  if (typeof metaName === 'string' && metaName.trim()) {
    return metaName.trim();
  }
  if (user?.email) {
    const raw = user.email.split('@')[0];
    const lettersOnly = raw.replace(/[0-9_.-]/g, '');
    if (lettersOnly.length >= 2) {
      return lettersOnly.charAt(0).toUpperCase() + lettersOnly.slice(1);
    }
    return raw;
  }
  return 'Devotee';
}

export function ProfileModal({
  isOpen,
  onClose,
  initialTab = 'persona',
}: {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'persona' | 'account';
}) {
  const [profileTab, setProfileTab] = useState<'persona' | 'account'>(initialTab);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<DevoteeProfile>(defaultProfile);
  const [profileDraft, setProfileDraft] = useState<DevoteeProfile>(defaultProfile);
  const [micLang, setMicLang] = useState('en-IN');
  const [authEmail, setAuthEmail] = useState('');
  const [authPending, setAuthPending] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [autoSync, setAutoSync] = useState(() => isAutoSyncEnabled());
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(() => getLastSyncedAt());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const ambient = useAmbientSound();

  function flash(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage((c) => (c === msg ? null : c)), 3200);
  }

  useEffect(() => {
    setProfileTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const loadedProfile = readProfile();
    setProfile(loadedProfile);
    setProfileDraft(loadedProfile);

    const savedLang = readPref(MIC_LANG_KEY);
    if (savedLang && MIC_LANGS.some((item) => item.code === savedLang)) {
      setMicLang(savedLang);
    }

    void getCurrentUser().then((u) => {
      setUser(u);
    });

    const sb = getSupabase();
    const sub = sb?.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });

    const onProfileChange = () => {
      const p = readProfile();
      setProfile(p);
      setProfileDraft(p);
    };

    window.addEventListener(PROFILE_EVENT, onProfileChange);

    return () => {
      sub?.data.subscription.unsubscribe();
      window.removeEventListener(PROFILE_EVENT, onProfileChange);
    };
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (isOpen) {
        document.body.classList.add('modal-drawer-open');
      } else {
        document.body.classList.remove('modal-drawer-open');
      }
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.body.classList.remove('modal-drawer-open');
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const displayName = getDevoteeDisplayName(profile, user);

  return (
    <div className="sanctuary-modal-backdrop" onClick={onClose}>
      <div className="sanctuary-modal-sheet sanctuary-auth-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-drag-indicator" aria-hidden="true">
          <span className="drag-pill" />
        </div>
        <header className="sanctuary-sheet-header">
          <div className="personalize-title-group">
            <span className="sanctuary-sheet-title">Devotee Profile & Companion</span>
            <span className="personalize-subtitle">
              Customize your name, Krishna&apos;s persona, and cloud sync
            </span>
          </div>
          <button
            type="button"
            className="sanctuary-close-btn"
            onClick={onClose}
            aria-label="Close profile modal"
          >
            ✕
          </button>
        </header>

        <div className="auth-body">
          {toastMessage ? (
            <div className="auth-notice-banner" role="status" style={{ background: 'rgba(79, 193, 187, 0.2)', borderColor: '#4fc1bb', color: '#bbf7f5' }}>
              {toastMessage}
            </div>
          ) : null}

          {authNotice ? (
            <div className="auth-notice-banner" role="alert">
              {authNotice}
            </div>
          ) : null}

          {/* Devotee Header Card with Name & Email */}
          <div className="profile-modal-user-header">
            <div className="auth-user-avatar">
              {(displayName[0] || 'D').toUpperCase()}
            </div>
            <div className="profile-header-text">
              <h3 className="profile-header-name">{displayName}</h3>
              <span className="profile-header-sub">
                {user?.email ? user.email : 'Guest Seeker'} · {PERSONA_DESCRIPTIONS[profile.persona ?? 'sakha'].label}
              </span>
              <span className="auth-user-sync-status">
                {syncStatus === 'syncing'
                  ? '🔄 Syncing in background…'
                  : syncStatus === 'error'
                  ? '⚠️ Offline / Sync pending'
                  : user && autoSync
                  ? lastSyncedAt
                    ? `🟢 Cloud sync active · Synced ${formatLastSynced(lastSyncedAt)}`
                    : '🟢 Cloud sync active'
                  : user
                  ? '⏸️ Auto-sync paused'
                  : '🕊️ Local device storage'}
              </span>
            </div>
          </div>

          {/* Tabs: Sakha Persona | Account & Sync */}
          <div className="profile-tabs-bar" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={profileTab === 'persona'}
              className={`profile-tab-btn ${profileTab === 'persona' ? 'profile-tab-active' : ''}`}
              onClick={() => setProfileTab('persona')}
            >
              <span>{PERSONA_DESCRIPTIONS[profileDraft.persona || 'sakha'].icon}</span>
              <span>Companion ({PERSONA_DESCRIPTIONS[profileDraft.persona || 'sakha'].label})</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={profileTab === 'account'}
              className={`profile-tab-btn ${profileTab === 'account' ? 'profile-tab-active' : ''}`}
              onClick={() => setProfileTab('account')}
            >
              <span>{user ? '☁️' : '🔐'}</span>
              <span>{user ? 'Account & Sync' : 'Sign In'}</span>
            </button>
          </div>

          {/* TAB 1: SAKHA / COMPANION PERSONA */}
          {profileTab === 'persona' && (
            <div className="personalize-body" style={{ padding: 0 }}>
              {/* Devotee Preferred Name */}
              <div className="personalize-field">
                <label htmlFor="devotee-name" className="personalize-label">
                  What should Krishna call you?
                </label>
                <input
                  id="devotee-name"
                  type="text"
                  className="personalize-input"
                  placeholder="e.g. Jothimani, Mani, Arjun..."
                  maxLength={50}
                  value={profileDraft.preferredName ?? ''}
                  onChange={(e) => setProfileDraft((curr) => ({ ...curr, preferredName: e.target.value }))}
                />
              </div>

              {/* Spoken Language */}
              <div className="personalize-field">
                <label htmlFor="devotee-lang" className="personalize-label">
                  Spoken Language
                </label>
                <select
                  id="devotee-lang"
                  className="personalize-input"
                  value={micLang}
                  onChange={(e) => {
                    setMicLang(e.target.value);
                    writePref(MIC_LANG_KEY, e.target.value);
                  }}
                >
                  {MIC_LANGS.map((lang) => (
                    <option key={lang.code} value={lang.code} style={{ background: '#0e1636', color: '#fdfbf7' }}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Persona Selector */}
              <div className="personalize-field">
                <span className="personalize-label">How should Krishna speak to you?</span>
                <div className="persona-cards-grid">
                  {(Object.keys(PERSONA_DESCRIPTIONS) as CompanionPersona[]).map((pKey) => {
                    const info = PERSONA_DESCRIPTIONS[pKey];
                    const selected = (profileDraft.persona || 'sakha') === pKey;
                    return (
                      <button
                        key={pKey}
                        type="button"
                        className={`persona-card ${selected ? 'persona-card-active' : ''}`}
                        onClick={() => setProfileDraft((curr) => ({ ...curr, persona: pKey }))}
                      >
                        <div className="persona-card-top">
                          <span className="persona-card-icon">{info.icon}</span>
                          <span className="persona-card-name">{info.label}</span>
                          {selected ? <span className="persona-check">✓</span> : null}
                        </div>
                        <span className="persona-card-title">{info.title}</span>
                        <p className="persona-card-summary">{info.summary}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Life Context */}
              <div className="personalize-field">
                <label htmlFor="devotee-context" className="personalize-label">
                  What is on your heart most these days? <span className="personalize-optional">(Optional)</span>
                </label>
                <div className="focus-quick-chips">
                  {[
                    'Peace of mind & calmness',
                    'Career & decision making',
                    'Overcoming doubt & fear',
                    'Duty & family relationships',
                    'Deepening devotion & surrender',
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      className={`focus-chip ${profileDraft.lifeContext === chip ? 'focus-chip-active' : ''}`}
                      onClick={() =>
                        setProfileDraft((curr) => ({
                          ...curr,
                          lifeContext: curr.lifeContext === chip ? '' : chip,
                        }))
                      }
                    >
                      {chip}
                    </button>
                  ))}
                </div>
                <input
                  id="devotee-context"
                  type="text"
                  className="personalize-input"
                  placeholder="Or write your own life context..."
                  maxLength={150}
                  value={profileDraft.lifeContext ?? ''}
                  onChange={(e) => setProfileDraft((curr) => ({ ...curr, lifeContext: e.target.value }))}
                />
              </div>

              {/* Sacred Ambient Soundscape Setting */}
              <div className="personalize-field">
                <div className="personalize-ambient-row">
                  <div>
                    <label htmlFor="ambient-toggle" className="personalize-label" style={{ marginBottom: 0 }}>
                      Sacred Ambient Music
                    </label>
                    <p className="personalize-hint">
                      Devotional flute, Tanpura plucks, and meditative drone
                    </p>
                  </div>
                  <input
                    id="ambient-toggle"
                    type="checkbox"
                    className="switch"
                    checked={ambient.enabled}
                    onChange={() => ambient.toggle()}
                  />
                </div>
                {ambient.enabled && (
                  <>
                    <div style={{ marginTop: 'var(--space-2)' }}>
                      <label htmlFor="ambient-track-select" className="personalize-label" style={{ fontSize: 'var(--size-12)' }}>
                        Select Background Music Track
                      </label>
                      <select
                        id="ambient-track-select"
                        className="personalize-input"
                        value={ambient.track}
                        onChange={(e) => ambient.setTrack(e.target.value)}
                        style={{ fontSize: 'var(--size-13)', padding: '6px 10px' }}
                      >
                        {ambient.tracks.map((t) => (
                          <option key={t.id} value={t.path}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                      {ambient.isFallback && (
                        <p className="personalize-hint" style={{ color: 'var(--gold-300)' }}>
                          ℹ️ Custom track failed to load — automatically switched back to default soundscape.
                        </p>
                      )}
                    </div>
                    <div className="personalize-volume-row">
                      <span className="volume-label">Volume ({Math.round(ambient.volume * 100)}%)</span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={ambient.volume}
                        onChange={(e) => ambient.setVolume(parseFloat(e.target.value))}
                        className="ambient-slider"
                        aria-label="Ambient Sound Volume"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Save Profile Button */}
              <div className="personalize-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onClose}
                >
                  Close
                </button>
                <button
                  type="button"
                  className={`btn btn-primary ${isSaved ? 'btn-saved' : ''}`}
                  onClick={() => {
                    setIsSaved(true);
                    writeProfile(profileDraft);
                    setProfile(profileDraft);
                    if (user?.id) {
                      void syncUserData(user.id);
                    }
                    flash('Companion preferences & name saved');
                    setTimeout(() => {
                      setIsSaved(false);
                      onClose();
                    }, 500);
                  }}
                  disabled={isSaved}
                >
                  {isSaved ? '✓ Saved!' : 'Save Preferences'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: ACCOUNT & CLOUD SYNC */}
          {profileTab === 'account' && (
            <>
              {user ? (
                <div className="auth-signed-in-card">
                  {/* Background Auto-Sync Option */}
                  <label className="switch-row auth-autosync-row">
                    <div>
                      <span className="switch-title">Background Auto-Sync</span>
                      <span className="switch-sub">
                        Seamlessly backs up your profile, reflections & saved verses
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      className="switch"
                      checked={autoSync}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setAutoSync(val);
                        setAutoSyncEnabled(val);
                        if (val && user) {
                          setSyncStatus('syncing');
                          void syncUserData(user.id).then((res) => {
                            if (res.success) {
                              setSyncStatus('synced');
                              setLastSyncedAt(Date.now());
                              flash('Auto-sync enabled & synced with cloud');
                            }
                          });
                        } else {
                          flash('Auto-sync paused');
                        }
                      }}
                    />
                  </label>

                  {/* Sign Out Action */}
                  <div className="auth-signed-in-actions">
                    <button
                      type="button"
                      className="btn btn-secondary auth-btn-signout"
                      style={{ width: '100%' }}
                      onClick={async () => {
                        await signOut();
                        setUser(null);
                        onClose();
                        flash('Signed out successfully');
                      }}
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              ) : (
                /* Sign In / Sign Up Form */
                <div className="auth-signin-container">
                  <div className="auth-preservation-pill">
                    <span>🕊️</span>
                    <span>Your guest profile, preferences, and saved verses will be preserved upon sign in.</span>
                  </div>

                  {/* Google OAuth Button */}
                  <button
                    type="button"
                    className="auth-google-btn"
                    disabled={authPending}
                    onClick={async () => {
                      if (!isSupabaseConfigured()) {
                        setAuthNotice('Supabase credentials needed in .env.local (schema is ready in supabase/schema.sql)');
                        return;
                      }
                      setAuthPending(true);
                      const { error } = await signInWithGoogle();
                      if (error) {
                        setAuthNotice(error.message);
                        setAuthPending(false);
                      }
                    }}
                  >
                    <svg className="auth-google-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>{authPending ? 'Connecting to Google…' : 'Continue with Google'}</span>
                  </button>

                  <div className="auth-divider">
                    <span className="auth-divider-line" />
                    <span className="auth-divider-text">or with email link</span>
                    <span className="auth-divider-line" />
                  </div>

                  {/* Magic Link Form */}
                  <form
                    className="auth-email-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!isSupabaseConfigured()) {
                        setAuthNotice('Supabase credentials needed in .env.local (schema is ready in supabase/schema.sql)');
                        return;
                      }
                      if (!authEmail.trim()) return;
                      setAuthPending(true);
                      setAuthNotice(null);
                      const { error } = await signInWithEmail(authEmail);
                      setAuthPending(false);
                      if (error) {
                        setAuthNotice(error.message);
                      } else {
                        setAuthNotice(`Check your email inbox! A sacred sign-in link was sent to ${authEmail}.`);
                        setAuthEmail('');
                      }
                    }}
                  >
                    <input
                      type="email"
                      className="personalize-input auth-email-input"
                      placeholder="Enter your email address…"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      required
                    />
                    <button
                      type="submit"
                      className="btn btn-primary auth-submit-btn"
                      disabled={authPending || !authEmail.trim()}
                    >
                      {authPending ? 'Sending…' : 'Send Sign-In Link'}
                    </button>
                  </form>

                  {!isSupabaseConfigured() ? (
                    <div className="auth-setup-banner">
                      <p className="auth-setup-title">⚙️ Cloud Sync Ready</p>
                      <p className="auth-setup-desc">
                        To enable live Supabase authentication, simply add your <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to <code>.env.local</code>. Database schema is generated in <code>supabase/schema.sql</code>.
                      </p>
                    </div>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
