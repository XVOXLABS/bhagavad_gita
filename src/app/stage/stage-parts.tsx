import type { ReactNode } from 'react';
import type { DisplayVerse } from '@/lib/corpus';
import type { Crisis } from './conversation';

export function LotusMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 44" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="lotus-outer" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6c56f" />
          <stop offset="1" stopColor="#d98a2c" />
        </linearGradient>
        <linearGradient id="lotus-inner" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fde3a6" />
          <stop offset="1" stopColor="#ee9f3a" />
        </linearGradient>
        <radialGradient id="lotus-flame" cx="50%" cy="60%" r="50%">
          <stop offset="0" stopColor="#fffbe8" />
          <stop offset="1" stopColor="#ffd98a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path fill="url(#lotus-outer)" d="M32 38C21 39 8 34 2 23C13 21 26 27 32 38Z" />
      <path fill="url(#lotus-outer)" d="M32 38C43 39 56 34 62 23C51 21 38 27 32 38Z" />
      <path fill="url(#lotus-inner)" stroke="#b86f1e" strokeWidth="0.5" d="M32 37C22 33 13 23 13 9C22 12 30 21 32 37Z" />
      <path fill="url(#lotus-inner)" stroke="#b86f1e" strokeWidth="0.5" d="M32 37C42 33 51 23 51 9C42 12 34 21 32 37Z" />
      <path fill="url(#lotus-inner)" stroke="#b86f1e" strokeWidth="0.5" d="M32 2C23 12 23 28 32 37C41 28 41 12 32 2Z" />
      <ellipse fill="url(#lotus-flame)" cx="32" cy="24" rx="9" ry="12" />
      <path fill="#e9a03f" d="M32 39l4 2.5-4 2.5-4-2.5z" />
    </svg>
  );
}

export function Ornament() {
  return (
    <svg className="stage-ornament" viewBox="0 0 280 20" aria-hidden="true">
      <path d="M0 10H118M162 10H280" stroke="currentColor" strokeWidth="1.2" />
      <path d="M118 10c6-4 8-4 12 0-4 4-6 4-12 0zM162 10c-6-4-8-4-12 0 4 4 6 4 12 0z" fill="currentColor" />
      <path d="M140 2l7 8-7 8-7-8z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="140" cy="10" r="1.8" fill="currentColor" />
    </svg>
  );
}

const WAVE = [0.12, 0.2, 0.14, 0.32, 0.22, 0.46, 0.3, 0.62, 0.44, 0.82, 0.58, 1, 0.7, 1, 0.58, 0.82, 0.44, 0.62, 0.3, 0.46, 0.22, 0.32, 0.14, 0.2, 0.12];

/** The violet voice line from the film. `level` follows the microphone; otherwise it moves on its own. */
export function Waveform({ active, level, className }: { active: boolean; level?: number; className?: string }) {
  return (
    <span className={`stage-wave ${active && level === undefined ? 'is-active' : ''} ${className ?? ''}`} aria-hidden="true">
      {WAVE.map((weight, index) => (
        <span
          key={index}
          style={{
            height: `${Math.round(weight * 100)}%`,
            animationDelay: `${(index % 7) * 110}ms`,
            transform: level === undefined ? undefined : `scaleY(${Math.max(0.16, Math.min(1, level * 1.6 + 0.16))})`,
          }}
        />
      ))}
    </span>
  );
}

export function CrisisCard({ crisis }: { crisis: NonNullable<Crisis> }) {
  return (
    <aside className="crisis stage-crisis" role="alert">
      <p className="crisis-message">{crisis.message}</p>
      <ul className="crisis-lines">
        {crisis.helplines.map((line) => (
          <li key={line.number}>
            <a href={`tel:${line.number}`} className="crisis-call">
              <span className="crisis-name">{line.name}</span>
              <span className="crisis-number">{line.number}</span>
            </a>
            <span className="crisis-note">{line.note}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/** Sanskrit as stored, without the printed verse number. */
export function cleanSanskrit(verse: DisplayVerse): string {
  // Some verses are stored on one line; each half still gets its own line on screen.
  return verse.sanskrit
    .replace(/।।\s*\d+\.\d+\s*।।/g, '॥')
    .replace(/\n\s*\n+/g, '\n')
    .replace(/।(?=[^\s॥])/g, '।\n')
    .trim();
}

export function Parchment({ verse }: { verse: DisplayVerse }) {
  return (
    <blockquote className="stage-parchment" lang="sa">
      {cleanSanskrit(verse)}
    </blockquote>
  );
}

export function Message({ children, tone }: { children: ReactNode; tone?: 'welcome' | 'long' }) {
  return <p className={`stage-message ${tone ? `stage-message-${tone}` : ''}`}>{children}</p>;
}

/** The four coloured marks from the film's menu. */
export const ChatBubbleArt = () => (
  <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
    <path fill="#a06cf0" d="M16 4C8.3 4 2.5 8.9 2.5 15c0 3.3 1.7 6.2 4.5 8.2L6 28.5l6-3c1.3.3 2.6.5 4 .5 7.7 0 13.5-4.9 13.5-11S23.7 4 16 4z" />
    <circle cx="10.5" cy="15" r="1.9" fill="#f2e8ff" />
    <circle cx="16" cy="15" r="1.9" fill="#f2e8ff" />
    <circle cx="21.5" cy="15" r="1.9" fill="#f2e8ff" />
  </svg>
);

export const QuestionArt = () => (
  <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
    <path fill="none" stroke="#b78cf7" strokeWidth="3.6" strokeLinecap="round" d="M9.5 10.5C9.5 6.5 12.5 4 16 4s6.5 2.4 6.5 6c0 5.5-6.5 5.8-6.5 11" />
    <circle cx="16" cy="27.2" r="2.5" fill="#b78cf7" />
  </svg>
);

export const BookArt = () => (
  <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
    <path fill="#3f73c9" d="M2 7v20c5-1.6 10-1 14 1.5C20 26 25 25.4 30 27V7H2z" />
    <path fill="#a9cdf2" d="M4 5.5v19c4-1 8.4-.5 12 2V7.500C12.400 5 8 4.500 4 5.500z" />
    <path fill="#f4dfba" d="M28 5.500v19c-4-1-8.400-.5-12 2V7.500c3.600-2.500 8-3 12-2z" />
  </svg>
);

export const LeafArt = () => (
  <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
    <path fill="#5fb546" d="M16 25C10 22 7.500 15 11 4c5 3.500 7.500 7 8 11 .3 3.500-1 7-3 10z" />
    <path fill="#3f9a3a" d="M15 25.500C8.500 25.500 3.500 21 2 11.500c5.500.5 9.500 3 12 7 1.200 2.200 1.500 4.700 1 7z" />
    <path fill="#8fce4f" d="M17 25.500c6.500 0 11.500-4.500 13-14-5.500.5-9.500 3-12 7-1.200 2.200-1.500 4.700-1 7z" />
    <path fill="#e8a33c" d="M6 26.500c5-2.500 15-2.500 20 0-3 2.300-6.500 3-10 3s-7-.7-10-3z" />
  </svg>
);
