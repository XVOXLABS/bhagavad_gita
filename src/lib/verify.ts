import { lookup, toDisplay, type DisplayVerse } from './corpus';
import { DEVANAGARI_LANGUAGES, detectLanguage, isLanguage } from './language';
import type { Intent, Situation } from './retrieve';
import { isThemeId, themesFromText } from './themes';

const INTENTS = new Set<Intent>([
  'problem',
  'acknowledgment',
  'follow_up',
  'greeting',
  'about_me',
  'language_request',
  'unclear',
  'off_topic',
  'harmful',
]);

/** Intents answered with a verse via RAG. Only genuine problems / life dilemmas get a verse. Everything else gets a short conversational reply. */
export function needsVerse(intent: Intent): boolean {
  return intent === 'problem';
}

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

function words(text: string): string[] {
  return text
    .replace(/[।॥|0-9.,;:!?'"()\-]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

/** True when three consecutive words of a verse's Sanskrit appear in the text. */
function quotesSanskrit(text: string, sanskrit: string[]): boolean {
  const haystack = ` ${words(text).join(' ')} `;
  for (const verse of sanskrit) {
    const tokens = words(verse);
    for (let i = 0; i + 3 <= tokens.length; i += 1) {
      if (haystack.includes(` ${tokens.slice(i, i + 3).join(' ')} `)) return true;
    }
  }
  return false;
}

/**
 * Verse numbers are never allowed. Devanagari is blocked unless the reply language is written in it;
 * then only quoted Sanskrit from the cited verses counts as a leak.
 */
export function guidanceLeaks(guidance: string, language = 'en', sanskrit: string[] = []): boolean {
  if (VERSE_REF.test(guidance)) return true;
  if (!DEVANAGARI_LANGUAGES.has(language)) return DEVANAGARI.test(guidance);
  return quotesSanskrit(guidance, sanskrit);
}

export function fallbackSituation(message: string, previousLanguage?: string): Situation {
  const typed = detectLanguage(message);
  return {
    intent: 'problem',
    replyLanguage: typed !== 'en' ? typed : previousLanguage ?? 'en',
    emotions: [],
    situation: message.slice(0, 300),
    need: '',
    themes: themesFromText(message),
    crisis: false,
    continuesPrevious: false,
  };
}

export function parseSituation(raw: string, message: string, previousLanguage?: string): Situation {
  const data = parseJsonObject(raw);
  if (!data) return fallbackSituation(message, previousLanguage);
  const emotions = Array.isArray(data.emotions) ? data.emotions.map((item) => text(item, 40)).filter(Boolean).slice(0, 3) : [];
  const themes = [...new Set(Array.isArray(data.themes) ? data.themes.filter(isThemeId) : [])]
    .filter((theme) => theme !== 'narrative')
    .slice(0, 3);
  const crisis = data.crisis === true;
  const intent: Intent = crisis ? 'problem' : INTENTS.has(data.intent as Intent) ? (data.intent as Intent) : 'problem';
  const verse = needsVerse(intent);
  return {
    intent,
    replyLanguage: isLanguage(data.replyLanguage) ? data.replyLanguage : fallbackSituation(message, previousLanguage).replyLanguage,
    emotions,
    situation: text(data.situation, 300) || (verse ? message.slice(0, 300) : ''),
    need: text(data.need, 200),
    themes: verse ? (themes.length > 0 ? themes : themesFromText(message)) : [],
    crisis,
    continuesPrevious: data.continuesPrevious === true,
  };
}

export function parseConversation(raw: string): string | null {
  const data = parseJsonObject(raw);
  const reply = data ? text(data.reply, 700) : '';
  return reply || null;
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

export function replyLeaks(reply: Reply, language = 'en', sanskrit: string[] = []): boolean {
  return [reply.acknowledge, reply.connection, reply.step].some((part) => guidanceLeaks(part, language, sanskrit));
}

const DEFAULT_ACKS: Record<string, string> = {
  ta: 'உன் மனதின் நிலையை நான் உணர்கிறேன், என் நண்பா.',
  hi: 'मैं तुम्हारे मन की स्थिति को समझता हूँ, मेरे सखा।',
  te: 'నీ మనసులోని భావాన్ని నేను అర్థం చేసుకుంటున్నాను, నా మిత్రమా.',
  kn: 'ನಿನ್ನ ಮನಸ್ಸಿನ ಭಾವನೆಯನ್ನು ನಾನು ಅರಿತಿದ್ದೇನೆ, ನನ್ನ ಗೆಳೆಯ.',
  ml: 'നിന്റെ മനസ്സിന്റെ അവസ്ഥ ഞാൻ അറിയുന്നു, എന്റെ സുഹൃത്തേ.',
  mr: 'मी तुझ्या मनाची अवस्था समजतो, माझ्या मित्रा.',
  bn: 'আমি তোমার মনের অবস্থা বুঝি, আমার বন্ধু।',
  gu: 'હું તારા મનની સ્થિતિ સમજું છું, મારા મિત્ર.',
  pa: 'ਮੈਂ ਤੁਹਾਡੇ ਮਨ ਦੀ ਸਥਿਤੀ ਨੂੰ ਸਮਝਦਾ ਹਾਂ, ਮੇਰੇ ਦੋਸਤ।',
  en: 'I hear the weight upon your heart, my friend, and I walk beside you.',
};

export function defaultAcknowledgment(language = 'en'): string {
  return DEFAULT_ACKS[language] ?? DEFAULT_ACKS.en;
}

/**
 * Strips the user's own message if the model echoed or parroted it in its reply.
 * Never allows Krishna to mirror or parrot the user's input back to them.
 */
export function stripEchoedInput(text: string, userMessage: string, language = 'en'): string {
  if (!text || !userMessage) return text;
  const cleanUser = userMessage.trim();
  if (cleanUser.length < 5) return text;

  const trimmed = text.trim();
  // Full echo
  if (trimmed === cleanUser || trimmed.toLowerCase() === cleanUser.toLowerCase()) {
    return defaultAcknowledgment(language);
  }

  // Prefixed echo (e.g. user sentence followed by actual reply or punctuation)
  if (trimmed.startsWith(cleanUser)) {
    const remainder = trimmed.slice(cleanUser.length).replace(/^[\s.,:;!?-]+/, '').trim();
    return remainder.length > 0 ? remainder : defaultAcknowledgment(language);
  }

  if (trimmed.toLowerCase().startsWith(cleanUser.toLowerCase())) {
    const remainder = trimmed.slice(cleanUser.length).replace(/^[\s.,:;!?-]+/, '').trim();
    return remainder.length > 0 ? remainder : defaultAcknowledgment(language);
  }

  return text;
}

const STOCK_OPENER =
  /^(?:i (?:hear|see|understand)(?: you)?\s*[—–,:-]\s*|i (?:hear|see|understand)(?: that)?\s+(?=you)|it (?:sounds|seems) like\s+)/i;

/** Models drift back to "I hear you…" despite the prompt; trim the stock opener so replies don't all start alike. */
export function tidyOpener(text: string): string {
  const match = text.match(STOCK_OPENER);
  if (!match) return text;
  const rest = text.slice(match[0].length).trim();
  if (rest.length < 12) return text;
  return rest.charAt(0).toUpperCase() + rest.slice(1);
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
