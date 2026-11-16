'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { KrishnaMark } from './icons';
import { useSavedVerses } from './saved';

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
        </div>
      </header>
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
