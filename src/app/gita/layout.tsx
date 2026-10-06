import Link from 'next/link';
import type { ReactNode } from 'react';
import { BookIcon, KrishnaMark } from '../icons';

export default function GitaLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand" aria-label="Speak with Krishna, home">
            <KrishnaMark className="brand-mark" />
            <span className="brand-text">
              <span className="brand-name">Speak with Krishna</span>
              <span className="brand-tag">Guidance from the Bhagavad Gita</span>
            </span>
          </Link>
          <nav className="top-actions" aria-label="Reading">
            <Link href="/gita" className="icon-btn" aria-label="All chapters" title="All chapters">
              <BookIcon />
            </Link>
            <Link href="/" className="btn btn-primary top-cta">
              Speak with Krishna
            </Link>
          </nav>
        </div>
      </header>
      <main className="content reader">{children}</main>
    </div>
  );
}
