import { lookup, toDisplay, type DisplayVerse } from './corpus';
import type { Situation } from './retrieve';
import { isThemeId, themesFromText } from './themes';

const VERSE_REF = /\d{1,2}\s*\.\s*\d{1,3}/;
const DEVANAGARI = /[ऀ-ॿ]/;
const MAX_CITATIONS = 2;

export type Selection = {
  no_strong_match: boolean;
  citations: { chapter: number; verse: number }[];
  reason: string;
};

export type SelectionResult = {
  status: 'answered' | 'no_strong_match' | 'needs_citations';
  verses: DisplayVerse[];
  dropped: string[];
};

export type Reply = {
  acknowledge: string;
  connection: string;
  step: string;
};

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    const data: unknown = JSON.parse(trimmed);
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function text(value: unknown, max = 600): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

export function guidanceLeaks(guidance: string): boolean {
  return VERSE_REF.test(guidance) || DEVANAGARI.test(guidance);
}

export function fallbackSituation(message: string): Situation {
  return {
    emotions: [],
    situation: message.slice(0, 300),
    need: '',
    themes: themesFromText(message),
    crisis: false,
    continuesPrevious: false,
  };
}

export function parseSituation(raw: string, message: string): Situation {
  const data = parseJsonObject(raw);
  if (!data) return fallbackSituation(message);
  const emotions = Array.isArray(data.emotions) ? data.emotions.map((item) => text(item, 40)).filter(Boolean).slice(0, 3) : [];
  const themes = [...new Set(Array.isArray(data.themes) ? data.themes.filter(isThemeId) : [])]
    .filter((theme) => theme !== 'narrative')
    .slice(0, 3);
  return {
    emotions,
    situation: text(data.situation, 300) || message.slice(0, 300),
    need: text(data.need, 200),
    themes: themes.length > 0 ? themes : themesFromText(message),
    crisis: data.crisis === true,
    continuesPrevious: data.continuesPrevious === true,
  };
}

export function parseSelection(raw: string): Selection | null {
  const data = parseJsonObject(raw);
  if (!data) return null;
  const citations: Selection['citations'] = [];
  if (Array.isArray(data.citations)) {
    for (const item of data.citations) {
      if (!item || typeof item !== 'object') continue;
      const chapter = Number((item as { chapter?: unknown }).chapter);
      const verse = Number((item as { verse?: unknown }).verse);
      if (Number.isInteger(chapter) && Number.isInteger(verse)) citations.push({ chapter, verse });
    }
  }
  const noStrong = data.no_strong_match === true;
  if (!noStrong && citations.length === 0) return null;
  return { no_strong_match: noStrong, citations, reason: text(data.reason, 300) };
}

/** Keeps only citations that exist in the corpus and were on the shortlist the model saw. */
export function evaluateSelection(selection: Selection, shortlistRefs: string[]): SelectionResult {
  if (selection.no_strong_match) {
    return {
      status: 'no_strong_match',
      verses: [],
      dropped: selection.citations.map((item) => `${item.chapter}.${item.verse}`),
    };
  }
  const allowed = new Set(shortlistRefs);
  const seen = new Set<string>();
  const verses: DisplayVerse[] = [];
  const dropped: string[] = [];
  for (const citation of selection.citations) {
    const key = `${citation.chapter}.${citation.verse}`;
    const found = lookup(citation.chapter, citation.verse);
    if (seen.has(key) || !found || !allowed.has(key) || verses.length >= MAX_CITATIONS) {
      dropped.push(key);
      continue;
    }
    seen.add(key);
    verses.push(toDisplay(found));
  }
  return { status: verses.length > 0 ? 'answered' : 'needs_citations', verses, dropped };
}

export function parseReply(raw: string): Reply | null {
  const data = parseJsonObject(raw);
  if (!data) return null;
  const reply = {
    acknowledge: text(data.acknowledge),
    connection: text(data.connection, 900),
    step: text(data.step),
  };
  if (!reply.acknowledge && !reply.connection) return null;
  return reply;
}

export function replyLeaks(reply: Reply): boolean {
  return guidanceLeaks(reply.acknowledge) || guidanceLeaks(reply.connection) || guidanceLeaks(reply.step);
}

export function replyText(reply: Reply): string {
  return [reply.acknowledge, reply.connection, reply.step].filter(Boolean).join('\n\n');
}

const FOLLOW_UP =
  /\b(that verse|this verse|say more|tell me more|explain that|what does that mean|go on|same verse)\b/i;

/** True when this message is a new situation and every cited verse was already used. */
export function citesOnlyPrior(message: string, prior: string[], next: string[]): boolean {
  if (prior.length === 0 || next.length === 0) return false;
  if (FOLLOW_UP.test(message)) return false;
  const seen = new Set(prior);
  return next.every((key) => seen.has(key));
}
