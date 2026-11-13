'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { KrishnaMark } from './icons';
import { useSavedVerses } from './saved';

const PLACES = [
  { href: '/', label: 'Speak with Krishna', match: (path: string) => path === '/' || path.startsWith('/talk') },
  { href: '/today', label: 'Today’s Verse', match: (path: string) => path.startsWith('/today') },
  { href: '/gita', label: 'Read Gita', match: (path: string) => path.startsWith('/gita') },
  { href: '/my-gita', label: 'My Gita', match: (path: string) => path.startsWith('/my-gita') },
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
                  {place.label}
                  {count > 0 ? <span className="nav-count">{count > 99 ? '99+' : count}</span> : null}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
