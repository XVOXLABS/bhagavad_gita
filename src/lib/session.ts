export type SessionMessage = {
  role: 'user' | 'assistant';
  content: string;
  citations?: string[];
  /** Language code the assistant replied in, so the next turn keeps it. */
  language?: string;
};

export function lastLanguage(history: SessionMessage[]): string | undefined {
  return [...history].reverse().find((turn) => turn.role === 'assistant' && turn.language)?.language;
}

export function lastCitations(history: SessionMessage[]): string[] {
  return [...history].reverse().find((turn) => turn.role === 'assistant' && turn.citations?.length)?.citations ?? [];
}

const MAX_MESSAGES = 8;

const globalStore = globalThis as unknown as { __gitaSessions?: Map<string, SessionMessage[]> };
const sessions = globalStore.__gitaSessions ?? new Map<string, SessionMessage[]>();
globalStore.__gitaSessions = sessions;

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
