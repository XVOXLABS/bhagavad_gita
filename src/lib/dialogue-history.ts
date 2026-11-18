import type { DisplayVerse } from './corpus';

export type DialogueMessage = {
  id: string;
  role: 'user' | 'assistant' | 'error';
  text: string;
  reply?: {
    acknowledge: string;
    connection: string;
    step: string;
  };
  verses?: DisplayVerse[];
  language?: string;
  timestamp: number;
};

export type DialogueSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: DialogueMessage[];
  citedVerses: string[];
};

export const DIALOGUES_KEY = 'gita.dialogues';
export const DIALOGUES_EVENT = 'gita-dialogues-changed';

function safeWindow(): Window | null {
  return typeof window !== 'undefined' ? window : null;
}

export function loadDialogues(): DialogueSession[] {
  const win = safeWindow();
  if (!win) return [];
  try {
    const raw = win.localStorage.getItem(DIALOGUES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function saveDialogue(session: DialogueSession): void {
  const win = safeWindow();
  if (!win) return;
  try {
    const existing = loadDialogues();
    const index = existing.findIndex((s) => s.id === session.id);
    let next: DialogueSession[];
    if (index >= 0) {
      next = [...existing];
      next[index] = session;
    } else {
      next = [session, ...existing];
    }
    // Cap at 30 recent dialogues to respect browser storage limits
    next = next.slice(0, 30);
    win.localStorage.setItem(DIALOGUES_KEY, JSON.stringify(next));
    win.dispatchEvent(new CustomEvent(DIALOGUES_EVENT));
  } catch {
    // LocalStorage quota or access error handled gracefully
  }
}

export function deleteDialogue(id: string): void {
  const win = safeWindow();
  if (!win) return;
  try {
    const existing = loadDialogues().filter((s) => s.id !== id);
    win.localStorage.setItem(DIALOGUES_KEY, JSON.stringify(existing));
    win.dispatchEvent(new CustomEvent(DIALOGUES_EVENT));
  } catch {
    // ignore
  }
}

/** Generates an insightful spiritual title for the conversation chapter. */
export function generateDialogueTitle(messages: DialogueMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  const firstAssistant = messages.find((m) => m.role === 'assistant');
  const citedVerse = firstAssistant?.verses?.[0];

  if (firstUser && firstUser.text) {
    const raw = firstUser.text.trim().replace(/^["']|["']$/g, '');
    let clean = raw.slice(0, 38).trim();
    if (raw.length > 38) clean += '…';
    clean = clean.charAt(0).toUpperCase() + clean.slice(1);

    if (citedVerse) {
      return `${clean} (Gita ${citedVerse.chapter}.${citedVerse.verse})`;
    }
    return clean;
  }

  if (citedVerse) {
    return `Wisdom of Gita ${citedVerse.chapter}.${citedVerse.verse}`;
  }

  return 'Dialogue with Krishna';
}

/** Formats timestamp into conversational relative time (Today, Yesterday, date). */
export function formatDialogueDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}
