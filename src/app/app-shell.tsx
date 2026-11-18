'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { defaultProfile, readProfile, PROFILE_EVENT, type DevoteeProfile } from '@/lib/profile';
import { getCurrentUser, getSupabase } from '@/lib/supabase';
import { KrishnaMark } from './icons';
import { useSavedVerses } from './saved';
import { ProfileModal, getDevoteeDisplayName } from './profile-modal';

const PLACES = [
  {
    href: '/',
    label: 'Speak with Krishna',
    shortLabel: 'Companion',
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
  const { saved } = useSavedVerses();
  const isCompanion = pathname === '/' || pathname.startsWith('/talk');

  const [profileOpen, setProfileOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<DevoteeProfile>(defaultProfile);

  useEffect(() => {
    setProfile(readProfile());
    void getCurrentUser().then(setUser);

    const sb = getSupabase();
    const sub = sb?.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });

    const onProfileChange = () => setProfile(readProfile());
    window.addEventListener(PROFILE_EVENT, onProfileChange);

    return () => {
      sub?.data?.subscription?.unsubscribe();
      window.removeEventListener(PROFILE_EVENT, onProfileChange);
    };
  }, []);

  const displayName = getDevoteeDisplayName(profile, user);

  return (
    <div className={`app ${isCompanion ? 'app-companion-view' : ''}`}>
      <header className={`topbar ${isCompanion ? 'topbar-companion' : ''}`}>
        <div className="topbar-inner">
          <Link href="/" className="brand" aria-label="Speak with Krishna">
            <KrishnaMark className="brand-mark" />
            <span className="brand-text">
              <span className="brand-name">Speak with Krishna</span>
              <span className="brand-tag">Divine Companion</span>
            </span>
          </Link>
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

          {/* Devotee Profile Button directly INSIDE the navigation bar */}
          <button
            type="button"
            className={`topbar-profile-btn ${user ? 'topbar-profile-active' : ''}`}
            onClick={() => setProfileOpen(true)}
            title={user ? `Signed in as ${displayName} (${user.email})` : 'Devotee Profile & Sign In'}
            aria-label="Profile and Settings"
          >
            <span className="topbar-avatar-badge">
              {user ? (displayName[0] || 'D').toUpperCase() : '👤'}
            </span>
            <span className="topbar-profile-name">{displayName}</span>
          </button>
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
