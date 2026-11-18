'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { defaultProfile, readProfile, PROFILE_EVENT, type DevoteeProfile } from '@/lib/profile';
import { getCurrentUser, getSupabase } from '@/lib/supabase';
import { loadDialogues, DIALOGUES_EVENT } from '@/lib/dialogue-history';
import { KrishnaMark } from './icons';
import { useSavedVerses } from './saved';
import { ProfileModal, getDevoteeDisplayName } from './profile-modal';

const PLACES = [
  {
    href: '/',
    label: 'Krishna',
    shortLabel: 'Krishna',
    icon: '🪷',
    match: (path: string) => path === '/' || path.startsWith('/talk'),
  },
  {
    href: '/today',
    label: 'Today’s Verse',
    shortLabel: 'Today',
    icon: '🌅',
    match: (path: string) => path.startsWith('/today'),
  },
  {
    href: '/gita',
    label: 'Read Gita',
    shortLabel: 'Gita',
    icon: '📖',
    match: (path: string) => path.startsWith('/gita'),
  },
  {
    href: '/my-gita',
    label: 'My Gita',
    shortLabel: 'My Gita',
    icon: '🕊️',
    match: (path: string) => path.startsWith('/my-gita'),
  },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { saved } = useSavedVerses();
  const isCompanion = pathname === '/' || pathname.startsWith('/talk');

  const [profileOpen, setProfileOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<DevoteeProfile>(defaultProfile);
  const [dialoguesCount, setDialoguesCount] = useState<number>(0);

  useEffect(() => {
    setProfile(readProfile());
    void getCurrentUser().then(setUser);

    const updateDialogues = () => {
      setDialoguesCount(loadDialogues().length);
    };
    updateDialogues();

    const sb = getSupabase();
    const sub = sb?.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });

    const onProfileChange = () => setProfile(readProfile());
    window.addEventListener(PROFILE_EVENT, onProfileChange);
    window.addEventListener(DIALOGUES_EVENT, updateDialogues);

    return () => {
      sub?.data?.subscription?.unsubscribe();
      window.removeEventListener(PROFILE_EVENT, onProfileChange);
      window.removeEventListener(DIALOGUES_EVENT, updateDialogues);
    };
  }, []);

  const displayName = getDevoteeDisplayName(profile, user);
  const avatarInitial = (displayName?.trim()?.[0] || 'D').toUpperCase();

  function handleOpenHistory() {
    if (isCompanion) {
      window.dispatchEvent(new CustomEvent('gita-open-history'));
    } else {
      router.push('/?history=1');
    }
  }

  return (
    <div className={`app ${isCompanion ? 'app-companion-view' : ''}`}>
      <header className={`topbar ${isCompanion ? 'topbar-companion' : ''}`}>
        <div className="topbar-inner">
          <div className="topbar-left">
            <Link href="/" className="brand" aria-label="Speak with Krishna">
              <KrishnaMark className="brand-mark" />
              <span className="brand-text">
                <span className="brand-name">Speak with Krishna</span>
                <span className="brand-tag">Divine Companion</span>
              </span>
            </Link>
          </div>

          <div className="topbar-center">
            <nav className="place-nav" aria-label="Places">
              {PLACES.map((place) => {
                const current = place.match(pathname);
                const count = place.href === '/my-gita' ? saved.length : 0;
                return (
                  <Link
                    key={place.href}
                    href={place.href}
                    className="place-link"
                    aria-current={current ? 'page' : undefined}
                  >
                    <span className="place-link-full">{place.label}</span>
                    <span className="place-link-short">{place.shortLabel}</span>
                    {count > 0 ? <span className="nav-count">{count > 99 ? '99+' : count}</span> : null}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="topbar-right">
            <div className="topbar-capsule-group">
              <button
                type="button"
                className="topbar-capsule-btn topbar-capsule-history"
                onClick={handleOpenHistory}
                title={dialoguesCount > 0 ? `Sacred Dialogues (${dialoguesCount})` : 'Sacred Dialogues (History)'}
                aria-label="View conversation history"
              >
                <span className="capsule-history-icon">📜</span>
                {dialoguesCount > 0 ? (
                  <span className="capsule-history-count">{dialoguesCount}</span>
                ) : null}
              </button>

              <span className="topbar-capsule-divider" aria-hidden="true" />

              <button
                type="button"
                className={`topbar-capsule-btn topbar-capsule-avatar ${user ? 'topbar-avatar-signed-in' : ''}`}
                onClick={() => setProfileOpen(true)}
                title={user ? `Signed in as ${displayName} (${user.email})` : `Devotee Profile (${displayName})`}
                aria-label="Profile and Settings"
              >
                <span className="topbar-avatar-initial">{avatarInitial}</span>
              </button>
            </div>
          </div>
        </div>
      </header>
      <ProfileModal isOpen={profileOpen} onClose={() => setProfileOpen(false)} />
      {children}

      {/* Modern Ergonomic Mobile Bottom Nav Bar (Active on Reading & Library screens) */}
      {!isCompanion ? (
        <nav className="mobile-bottom-nav" aria-label="Mobile Navigation">
          <div className="mobile-bottom-nav-inner">
            {PLACES.map((place) => {
              const current = place.match(pathname);
              const count = place.href === '/my-gita' ? saved.length : 0;
              return (
                <Link
                  key={place.href}
                  href={place.href}
                  className={`mobile-nav-item ${current ? 'mobile-nav-active' : ''}`}
                  aria-current={current ? 'page' : undefined}
                >
                  <span className="mobile-nav-icon">{place.icon}</span>
                  <span className="mobile-nav-label">{place.shortLabel}</span>
                  {count > 0 ? <span className="mobile-nav-badge">{count > 99 ? '99+' : count}</span> : null}
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
