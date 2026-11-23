export type SessionMessage = {
  role: 'user' | 'assistant';
  content: string;
  citations?: string[];
  /** Language code the assistant replied in, so the next turn keeps it. */
  language?: string;
  /** Lets the voice route speak exactly this reply and nothing else. */
  replyId?: string;
  speech?: string;
};

export function findReply(sessionId: string, replyId: string): { speech: string; language: string } | null {
  const turn = getSession(sessionId).find((item) => item.role === 'assistant' && item.replyId === replyId);
  return turn?.speech ? { speech: turn.speech, language: turn.language ?? 'en' } : null;
}

export function lastLanguage(history: SessionMessage[]): string | undefined {
  return [...history].reverse().find((turn) => turn.role === 'assistant' && turn.language)?.language;
}

export function lastCitations(history: SessionMessage[]): string[] {
  return [...history].reverse().find((turn) => turn.role === 'assistant' && turn.citations?.length)?.citations ?? [];
}

const MAX_MESSAGES = 8;

const globalStore = globalThis as unknown as {
  __gitaSessions?: Map<string, SessionMessage[]>;
  __gitaDrafts?: Map<string, ActiveDraft>;
};
const sessions = globalStore.__gitaSessions ?? new Map<string, SessionMessage[]>();
globalStore.__gitaSessions = sessions;

export type ActiveDraft = {
  replyId: string;
  sessionId: string;
  language: string;
  chunks: string[];
  createdAt: number;
};

const drafts = globalStore.__gitaDrafts ?? new Map<string, ActiveDraft>();
globalStore.__gitaDrafts = drafts;

export function registerDraftReply(sessionId: string, replyId: string, language = 'en'): void {
  const now = Date.now();
  for (const [key, val] of drafts.entries()) {
    if (now - val.createdAt > 300_000) drafts.delete(key);
  }
  drafts.set(replyId, {
    replyId,
    sessionId,
    language,
    chunks: [],
    createdAt: now,
  });
}

export function appendDraftChunk(replyId: string, text: string): number {
  const draft = drafts.get(replyId);
  if (!draft) return -1;
  draft.chunks.push(text);
  return draft.chunks.length - 1;
}

export function findReplyChunk(sessionId: string, replyId: string, chunkIndex: number): { speech: string; language: string } | null {
  const draft = drafts.get(replyId);
  if (draft && draft.sessionId === sessionId && draft.chunks[chunkIndex]) {
    return { speech: draft.chunks[chunkIndex], language: draft.language };
  }
  return null;
}

export function completeDraftReply(replyId: string): void {
  const draft = drafts.get(replyId);
  if (draft) {
    draft.createdAt = Date.now() - 270_000;
  }
}

export function getSession(sessionId: string): SessionMessage[] {
  return sessions.get(sessionId) ?? [];
}

export function clearSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function appendSession(sessionId: string, messages: SessionMessage[]): void {
  const next = [...getSession(sessionId), ...messages].slice(-MAX_MESSAGES);
  sessions.set(sessionId, next);
}
