'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CloseIcon } from './icons';
import { useSavedVerses } from './saved';
import { ConversationProvider, useConversation, type Panel } from './stage/conversation';
import { LotusMark } from './stage/stage-parts';

const PLACES = [
  { href: '/', label: 'Speak with Krishna', match: (path: string) => path === '/' },
  { href: '/today', label: 'Today’s verse', match: (path: string) => path.startsWith('/today') },
  { href: '/gita', label: 'Read the Gita', match: (path: string) => path.startsWith('/gita') },
  { href: '/my-gita', label: 'My Gita', match: (path: string) => path.startsWith('/my-gita') },
] as const;

function Menu({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { saved } = useSavedVerses();
  const c = useConversation();
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>('a, button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /** Conversation tools live on the conversation page, so they bring the person there first. */
  function onStage(run: () => void) {
    onClose();
    if (pathname !== '/') router.push('/');
    run();
  }

  const openPanel = (panel: Panel) => onStage(() => c.setPanel(panel));

  return (
    <>
      <button type="button" className="sheet-backdrop" aria-label="Close menu" onClick={onClose} />
      <nav ref={panelRef} className="gl-menu" aria-label="Menu">
        <div className="gl-menu-head">
          <span className="gl-menu-title">GitaLens</span>
          <button type="button" className="gl-icon" aria-label="Close menu" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <ul>
          {PLACES.map((place) => (
            <li key={place.href}>
              <Link href={place.href} className="gl-menu-link" aria-current={place.match(pathname) ? 'page' : undefined} onClick={onClose}>
                {place.label}
                {place.href === '/my-gita' && saved.length > 0 ? <span className="nav-count">{saved.length > 99 ? '99+' : saved.length}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
        <hr />
        <ul>
          <li>
            <button type="button" className="gl-menu-link" onClick={() => openPanel('transcript')}>
              Our conversation
            </button>
          </li>
          <li>
            <button type="button" className="gl-menu-link" onClick={() => openPanel('memory')}>
              What Krishna remembers
              {c.companion.memoryOn && c.companion.memories.length > 0 ? <span className="nav-count">{c.companion.memories.length}</span> : null}
            </button>
          </li>
          {c.canTalk ? (
            <li>
              <button type="button" className="gl-menu-link" onClick={() => onStage(c.startTalk)}>
                Talk hands-free
              </button>
            </li>
          ) : null}
          {c.avatarOn ? (
            <li>
              <button type="button" className="gl-menu-link" onClick={() => onStage(c.meetKrishna)}>
                Meet Krishna live
              </button>
            </li>
          ) : null}
          <li>
            <button type="button" className="gl-menu-link" disabled={c.pending !== null || c.messages.length === 0} onClick={() => onStage(() => void c.startNewTopic())}>
              New conversation
            </button>
          </li>
          <li>
            <button type="button" className="gl-menu-link" onClick={() => openPanel('settings')}>
              Settings
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}

function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { notice } = useConversation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const onStage = pathname === '/';

  function closeMenu() {
    setMenuOpen(false);
    menuButton.current?.focus();
  }

  return (
    <div className={`app ${onStage ? 'app-stage' : ''}`}>
      <header className={`gl-header ${onStage ? 'gl-header-stage' : ''}`}>
        <Link href="/" className="gl-brand" aria-label="GitaLens, speak with Krishna">
          <LotusMark className="gl-brand-mark" />
          <span className="gl-brand-text">
            <span className="gl-brand-name">GitaLens</span>
            <span className="gl-brand-tag">Speak with Krishna</span>
          </span>
        </Link>
        <button ref={menuButton} type="button" className="gl-icon gl-burger" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
          <span />
          <span />
          <span />
        </button>
      </header>
      {menuOpen ? <Menu onClose={closeMenu} /> : null}
      {children}
      {notice ? (
        <p className="toast" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ConversationProvider>
      <AppFrame>{children}</AppFrame>
    </ConversationProvider>
  );
}
