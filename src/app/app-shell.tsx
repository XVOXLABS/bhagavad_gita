'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { KrishnaMark } from './icons';
import { useSavedVerses } from './saved';

const PLACES = [
  { href: '/', label: 'Today', match: (path: string) => path === '/' },
  { href: '/talk', label: 'Talk', match: (path: string) => path.startsWith('/talk') },
  { href: '/gita', label: 'Read', match: (path: string) => path.startsWith('/gita') },
  { href: '/my-gita', label: 'My Gita', match: (path: string) => path.startsWith('/my-gita') },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { saved } = useSavedVerses();

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand" aria-label="Speak with Krishna, today">
            <KrishnaMark className="brand-mark" />
            <span className="brand-text">
              <span className="brand-name">Speak with Krishna</span>
              <span className="brand-tag">Guidance from the Bhagavad Gita</span>
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
