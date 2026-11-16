export type MemoryCategory = 'life_context' | 'struggle' | 'commitment' | 'milestone';

export type CompanionMemory = {
  id: string;
  fact: string;
  category: MemoryCategory;
  createdAt: number;
  associatedVerse?: string;
  active: boolean;
};

export const MEMORY_CATEGORIES: Record<
  MemoryCategory,
  { label: string; icon: string; description: string }
> = {
  life_context: {
    label: 'Life & Work',
    icon: '👤',
    description: 'Details about your life, work, family, or studies',
  },
  struggle: {
    label: 'Dilemmas & Feelings',
    icon: '🌧️',
    description: 'Inner struggles, doubts, and emotional situations you face',
  },
  commitment: {
    label: 'Spiritual Practices',
    icon: '🪷',
    description: 'Practices, reflections, and steps you committed to try',
  },
  milestone: {
    label: 'Growth & Realizations',
    icon: '🌟',
    description: 'Insights and breakthroughs you achieved on your journey',
  },
};

export const MEMORIES_KEY = 'gita.memories';
export const MEMORIES_EVENT = 'gita-memories-changed';
export const MAX_ACTIVE_MEMORIES = 25;

/** Generates clean unique ID for memories. */
export function memoryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Formats remembered facts into a natural context prompt for Krishna. */
export function formatMemoriesForPrompt(memories?: CompanionMemory[] | null): string {
  if (!memories || memories.length === 0) return '';
  const active = memories.filter((m) => m && m.active !== false && m.fact?.trim()).slice(0, 10);
  if (active.length === 0) return '';

  const lines = active.map((m) => {
    const verseNote = m.associatedVerse ? ` (related to Gita ${m.associatedVerse})` : '';
    return `- ${m.fact.trim()}${verseNote}`;
  });

  return [
    'What you remember about this person from earlier conversations (use with natural, warm familiarity like a true friend who remembers their journey; never recite mechanically):',
    ...lines,
  ].join('\n');
}

/** Client-side loader for memories stored in localStorage. */
export function readMemories(): CompanionMemory[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(MEMORIES_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .filter((item): item is CompanionMemory => Boolean(item && typeof item.fact === 'string' && item.fact.trim()))
      .slice(0, 50);
  } catch {
    return [];
  }
}

/** Client-side writer for memories stored in localStorage. */
export function writeMemories(memories: CompanionMemory[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MEMORIES_KEY, JSON.stringify(memories.slice(0, 50)));
    queueMicrotask(() => window.dispatchEvent(new Event(MEMORIES_EVENT)));
  } catch {
    // Storage quota fallback
  }
}

/** Merges newly extracted memories into existing ones, avoiding duplicates. */
export function mergeMemories(
  existing: CompanionMemory[],
  incoming: { fact: string; category?: MemoryCategory; associatedVerse?: string }[],
): CompanionMemory[] {
  const next = [...existing];
  const now = Date.now();

  for (const item of incoming) {
    const cleanFact = item.fact.trim();
    if (!cleanFact || cleanFact.length < 5) continue;

    // Check similarity / duplicate
    const lower = cleanFact.toLowerCase();
    const duplicate = next.some((m) => {
      const existingLower = m.fact.toLowerCase();
      return (
        existingLower === lower ||
        (existingLower.includes(lower) && lower.length > 20) ||
        (lower.includes(existingLower) && existingLower.length > 20)
      );
    });

    if (!duplicate) {
      next.unshift({
        id: memoryId(),
        fact: cleanFact,
        category: item.category || 'struggle',
        createdAt: now,
        associatedVerse: item.associatedVerse,
        active: true,
      });
    }
  }

  return next.slice(0, MAX_ACTIVE_MEMORIES);
}
