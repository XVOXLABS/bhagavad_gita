'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DisplayVerse } from '@/lib/corpus';

const SAVED_KEY = 'gita.saved';
const MAX_SAVED = 200;

export function verseRef(verse: Pick<DisplayVerse, 'chapter' | 'verse'>): string {
  return `${verse.chapter}.${verse.verse}`;
}

function read(): DisplayVerse[] {
  try {
    const raw = window.localStorage.getItem(SAVED_KEY);
    const data: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? (data as DisplayVerse[]).filter((item) => item && typeof item.chapter === 'number') : [];
  } catch {
    return [];
  }
}

function write(verses: DisplayVerse[]): void {
  try {
    window.localStorage.setItem(SAVED_KEY, JSON.stringify(verses));
  } catch {
    // Storage blocked (private mode): saved verses last for this visit only.
  }
}

/** "My Gita": verses a devotee keeps, stored on this device only. */
export function useSavedVerses() {
  const [saved, setSaved] = useState<DisplayVerse[]>([]);

  useEffect(() => {
    setSaved(read());
    const onStorage = (event: StorageEvent) => {
      if (event.key === SAVED_KEY) setSaved(read());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const isSaved = useCallback((verse: DisplayVerse) => saved.some((item) => verseRef(item) === verseRef(verse)), [saved]);

  const toggle = useCallback((verse: DisplayVerse) => {
    setSaved((current) => {
      const ref = verseRef(verse);
      const next = current.some((item) => verseRef(item) === ref)
        ? current.filter((item) => verseRef(item) !== ref)
        : [verse, ...current].slice(0, MAX_SAVED);
      write(next);
      return next;
    });
  }, []);

  return { saved, isSaved, toggle };
}
