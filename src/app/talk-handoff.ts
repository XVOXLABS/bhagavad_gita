const DRAFT_KEY = 'gita.talkDraft';

/** Words typed on Today, waiting in the Talk box. Kept for this tab only. */
export function stageTalkDraft(text: string): void {
  try {
    const trimmed = text.trim();
    if (trimmed) sessionStorage.setItem(DRAFT_KEY, trimmed);
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Private mode: the box opens empty.
  }
}

export function readTalkDraft(): string {
  try {
    return sessionStorage.getItem(DRAFT_KEY) ?? '';
  } catch {
    return '';
  }
}

export function clearTalkDraft(): void {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing stored.
  }
}
