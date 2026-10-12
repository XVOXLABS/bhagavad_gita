'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const KEY = 'gita.reading';

type LastReading = { chapter: number; name: string };

function readLast(): LastReading | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as LastReading;
    if (!data || typeof data.chapter !== 'number' || typeof data.name !== 'string') return null;
    if (data.chapter < 1 || data.chapter > 18) return null;
    return data;
  } catch {
    return null;
  }
}

export function rememberChapter(chapter: number, name: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ chapter, name }));
  } catch {
    // Storage blocked: continue-reading lasts for this visit only, and a refresh may drop it.
  }
}

/** Records the chapter a devotee opened, so Read can offer it again. */
export function RememberChapter({ chapter, name }: { chapter: number; name: string }) {
  useEffect(() => {
    rememberChapter(chapter, name);
  }, [chapter, name]);
  return null;
}

/** Shown on the chapter list when this browser has opened a chapter before. */
export function ContinueReading() {
  const [last, setLast] = useState<LastReading | null>(null);

  useEffect(() => {
    setLast(readLast());
  }, []);

  if (!last) return null;

  return (
    <Link href={`/gita/${last.chapter}`} className="continue-card">
      <span className="continue-kicker">Continue reading</span>
      <span className="continue-name">
        Chapter {last.chapter} · {last.name}
      </span>
    </Link>
  );
}
