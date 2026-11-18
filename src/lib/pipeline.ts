import { lookup, toDisplay, type DisplayVerse } from './corpus';
import { embedQuery } from './embed';
import { extractSituation, safeErrorMessage, selectVerses, writeConversation, writeReply } from './llm';
import { type CompanionMemory } from './memory';
import { type DevoteeProfile } from './profile';
import {
  FALLBACK_CONVERSE,
  FIXED_LEAD_IN,
  RESTATE_NOTE,
  RETRY_BAD_CITATIONS,
  RETRY_DIFFERENT_VERSE,
  RETRY_GUIDANCE_LEAK,
  RETRY_NOT_JSON,
  SAFE_NO_MATCH,
} from './prompt';
import { buildShortlist, queryText, type Shortlist, type Situation } from './retrieve';
import { mentionsCrisis } from './safety';
import { CONVERSE_KEYS, REPLY_KEYS, SentenceGate, type PipelineEvent } from './stream-reply';
import { lastCitations, lastLanguage, type SessionMessage } from './session';
import {
  citesOnlyPrior,
  evaluateSelection,
  fallbackSituation,
  guidanceLeaks,
  needsVerse,
  parseConversation,
  parseReply,
  parseSelection,
  parseSituation,
  replyLeaks,
  stripEchoedInput,
  tidyOpener,
  type Reply,
  type SelectionResult,
} from './verify';

export type ChatResult = {
  status: 'answered' | 'no_strong_match' | 'conversation' | 'unavailable';
  reply: Reply;
  verses: DisplayVerse[];
  crisis: boolean;
  language: string;
  calls: number;
  debug: {
    situation: Situation;
    shortlist: string[];
    mode: Shortlist['mode'] | 'none';
    reason: string;
    dropped: string[];
  };
};

export type Emit = (event: PipelineEvent) => void;

const EMPTY_REPLY: Reply = { acknowledge: '', connection: '', step: '' };

function refsOf(verses: DisplayVerse[]): string[] {
  return verses.map((verse) => `${verse.chapter}.${verse.verse}`);
}

function versesFor(refs: string[]): DisplayVerse[] {
  return refs.flatMap((ref) => {
    const [chapter, verse] = ref.split('.').map(Number);
    const found = lookup(chapter, verse);
    return found ? [toDisplay(found)] : [];
  });
}

/** Streams verified sentences of a JSON reply to `emit` as the model writes it; null when not streaming. */
function streamer(
  emit: Emit | undefined,
  keys: typeof REPLY_KEYS,
  language: string,
  sanskrit: string[] = [],
  userMessage = '',
) {
  if (!emit) return null;
  const gate = new SentenceGate(keys, language, sanskrit, userMessage);
  let firstClauseSent = false;
  return {
    gate,
    onText: (soFar: string) => {
      for (const delta of gate.push(soFar)) {
        emit({ type: 'delta', ...delta });
        if (!firstClauseSent && delta.text.trim()) {
          firstClauseSent = true;
          emit({ type: 'first_clause', text: delta.text.trim(), language });
        }
      }
    },
  };
}

/** Fast heuristic intent detector to skip extractSituation LLM call for simple greetings and acknowledgments. */
export function detectFastIntent(message: string, previousLanguage?: string): Situation | null {
  if (mentionsCrisis(message)) return null;

  const trimmed = message.trim();
  const words = trimmed.split(/\s+/);
  if (words.length > 8) return null; // Dilemmas and verse questions are typically longer

  const clean = trimmed.toLowerCase().replace(/[.,!?;:।॥"']/g, '').trim();

  const COMPANION_QUERIES = [
    'how are you', 'how are you doing', 'what are you doing', 'what are you up to', 'what\'s up', 'whats up', 'wyd',
    'did you eat', 'have you eaten', 'had your dinner', 'had your lunch', 'had lunch', 'had dinner',
    'talk to me', 'talk with me', 'let\'s talk', 'lets talk', 'speak with me', 'just wanted to chat',
    'i am bored', 'im bored', 'feeling bored', 'bore adikuthu', 'bore adikkuthu',
    'kya kar rahe ho', 'khana khaya', 'kaise ho',
    'சாப்பிட்டியா', 'சாப்டியா', 'சாப்பிட்டீங்களா', 'என்ன பண்ற', 'என்ன பண்றீங்க',
    'எப்படி இருக்க', 'எப்படி இருக்கீங்க', 'சும்மா பேசலாம்', 'பேசுடா', 'பேசுங்க',
    'bore அடிக்குது', 'போர் அடிக்குது',
  ];

  const isCompanion = COMPANION_QUERIES.some((q) => clean === q || clean.includes(q));

  if (isCompanion) {
    const isTa = /[஀-௿]/.test(trimmed) || clean.includes('adikuthu') || clean.includes('pesu');
    const isHi = /[ऀ-ॿ]/.test(trimmed) || clean.includes('kaise') || clean.includes('kya');
    const detectedLang = isTa ? 'ta' : isHi ? 'hi' : previousLanguage || 'en';

    return {
      intent: 'companion',
      replyLanguage: detectedLang,
      emotions: [],
      situation: '',
      need: '',
      themes: [],
      crisis: false,
      continuesPrevious: false,
    };
  }

  const GREETINGS = new Set([
    'hi', 'hello', 'hey', 'namaste', 'namaskar', 'pranam', 'pranaam',
    'radhe radhe', 'radhey radhey', 'jai shri krishna', 'hare krishna',
    'good morning', 'good evening', 'good afternoon', 'good day',
    'vanakkam', 'namaskaram',
  ]);

  const cleanWords = clean.split(/\s+/);
  const firstWord = cleanWords[0];
  const firstTwo = cleanWords.slice(0, 2).join(' ');

  const isGreeting =
    GREETINGS.has(clean) ||
    GREETINGS.has(firstWord) ||
    GREETINGS.has(firstTwo);

  if (isGreeting) {
    return {
      intent: 'greeting',
      replyLanguage: previousLanguage || 'en',
      emotions: [],
      situation: '',
      need: '',
      themes: [],
      crisis: false,
      continuesPrevious: false,
    };
  }

  const ACKS = new Set([
    'thank you', 'thanks', 'thank you krishna', 'thanks krishna', 'dhanyawad', 'shukriya', 'nandri',
    'ok', 'okay', 'got it', 'sure', 'alright', 'i agree', 'will do', 'i will do that', 'yes', 'understood',
    'fine', 'cool',
  ]);

  const isAck =
    ACKS.has(clean) ||
    [...ACKS].some((a) => clean.startsWith(`${a} `) || clean.endsWith(` ${a}`));

  if (isAck) {
    return {
      intent: 'acknowledgment',
      replyLanguage: previousLanguage || 'en',
      emotions: [],
      situation: '',
      need: '',
      themes: [],
      crisis: false,
      continuesPrevious: true,
    };
  }

  const ABOUT_ME = new Set([
    'who are you', 'what are you', 'are you real', 'how do you work', 'tell me about yourself',
  ]);

  if (ABOUT_ME.has(clean)) {
    return {
      intent: 'about_me',
      replyLanguage: previousLanguage || 'en',
      emotions: [],
      situation: '',
      need: '',
      themes: [],
      crisis: false,
      continuesPrevious: false,
    };
  }

  return null;
}

/**
 * Runs the whole reply. With `emit`, progress, the chosen verse and the reply's verified sentences are
 * reported as they happen; the returned result is still the final, authoritative reply.
 */
export async function respond(
  message: string,
  history: SessionMessage[],
  emit?: Emit,
  profile?: DevoteeProfile | null,
  memories?: CompanionMemory[] | null,
): Promise<ChatResult> {
  let calls = 0;
  const priorRefs = [...new Set(history.flatMap((turn) => turn.citations ?? []))];
  const previousLanguage = lastLanguage(history) ?? profile?.language;

  emit?.({ type: 'stage', stage: 'understanding' });

  // 1. Fast-path intent check: skips 450ms LLM call for greetings and conversational acknowledgments
  const fastSituation = detectFastIntent(message, previousLanguage);

  let situation: Situation;
  let queryVectorPromise: Promise<Float32Array | null> | null = null;

  if (fastSituation) {
    situation = fastSituation;
  } else {
    // 2. Speculatively start embedding query concurrently with LLM situation extraction
    queryVectorPromise = embedQuery(message).catch(() => null);

    try {
      calls += 1;
      situation = parseSituation(await extractSituation(message, history, profile), message, previousLanguage);
    } catch (error) {
      console.info(JSON.stringify({ event: 'situation_failed', detail: safeErrorMessage(error) }));
      situation = fallbackSituation(message, previousLanguage);
    }
  }

  const crisis = mentionsCrisis(message) || situation.crisis;
  if (crisis) situation = { ...situation, intent: 'problem', crisis: true };
  const language = situation.replyLanguage;
  const debug: ChatResult['debug'] = { situation, shortlist: [], mode: 'none', reason: '', dropped: [] };
  console.info(JSON.stringify({ event: 'intent', intent: situation.intent, language, crisis }));

  // A language switch re-expresses the last guidance; it is not a new situation.
  const restate =
    situation.intent === 'language_request' && lastCitations(history).length > 0 && previousLanguage !== language;

  if (!needsVerse(situation.intent) && !restate) {
    emit?.({ type: 'stage', stage: 'writing' });
    const live = streamer(emit, CONVERSE_KEYS, language, [], message);
    let text: string | null = null;
    try {
      calls += 1;
      text = parseConversation(await writeConversation(message, history, situation, live?.onText, profile, memories));
    } catch (error) {
      console.info(JSON.stringify({ event: 'converse_failed', detail: safeErrorMessage(error) }));
    }
    if (!text || live?.gate.leaked || guidanceLeaks(text, language)) {
      if (live?.gate.emitted) emit?.({ type: 'reset' });
      text = FALLBACK_CONVERSE;
    }
    text = stripEchoedInput(text, message, language);
    text = tidyOpener(text);
    return {
      status: 'conversation',
      reply: { acknowledge: text, connection: '', step: '' },
      verses: [],
      crisis: false,
      language: text === FALLBACK_CONVERSE ? 'en' : language,
      calls,
      debug,
    };
  }

  let verses: DisplayVerse[];
  if (restate) {
    verses = versesFor(lastCitations(history));
  } else {
    emit?.({ type: 'stage', stage: 'searching' });
    const queryVector = (await queryVectorPromise) ?? (await embedQuery(queryText(message, situation)));
    const shortlist = buildShortlist({
      message,
      situation,
      queryVector,
      pinnedRefs: situation.continuesPrevious ? priorRefs : [],
    });
    debug.shortlist = shortlist.refs;
    debug.mode = shortlist.mode;
    console.info(
      JSON.stringify({ event: 'verse_shortlist', mode: shortlist.mode, count: shortlist.refs.length, refs: shortlist.refs.slice(0, 8) }),
    );

    async function select(note?: string): Promise<{ result: SelectionResult; reason: string } | null> {
      calls += 1;
      const parsed = parseSelection(await selectVerses(message, situation, shortlist, priorRefs, note));
      if (!parsed) return null;
      const result = evaluateSelection(parsed, shortlist.refs);
      debug.dropped.push(...result.dropped);
      return { result, reason: parsed.reason };
    }

    let chosen: { result: SelectionResult; reason: string } | null;
    emit?.({ type: 'stage', stage: 'choosing' });
    try {
      chosen = await select();
      if (!chosen || chosen.result.status === 'needs_citations') {
        chosen = await select(chosen ? RETRY_BAD_CITATIONS : RETRY_NOT_JSON);
      }
      if (
        chosen?.result.status === 'answered' &&
        citesOnlyPrior(message, priorRefs, refsOf(chosen.result.verses))
      ) {
        const varied = await select(RETRY_DIFFERENT_VERSE);
        if (varied?.result.status === 'answered' && !citesOnlyPrior(message, priorRefs, refsOf(varied.result.verses))) {
          chosen = varied;
        }
      }
    } catch (error) {
      console.info(JSON.stringify({ event: 'select_failed', detail: safeErrorMessage(error) }));
      return { status: 'unavailable', reply: EMPTY_REPLY, verses: [], crisis, language, calls, debug };
    }
    verses = chosen?.result.status === 'answered' ? chosen.result.verses : [];
    debug.reason = chosen?.reason ?? '';
  }

  const status: ChatResult['status'] = verses.length > 0 ? 'answered' : 'no_strong_match';
  const sanskrit = verses.map((verse) => verse.sanskrit);
  const baseNote = restate ? RESTATE_NOTE : undefined;

  emit?.({ type: 'verses', verses, crisis });
  emit?.({ type: 'stage', stage: 'writing' });
  // With no verse the connection is dropped below, so it is never streamed either.
  const keys = verses.length > 0 ? REPLY_KEYS : REPLY_KEYS.filter((entry) => entry.field !== 'connection');
  const live = streamer(emit, keys, language, sanskrit, message);

  let reply: Reply | null = null;
  try {
    calls += 1;
    reply = parseReply(await writeReply(message, history, situation, verses, crisis, baseNote, live?.onText, profile, memories));
    if (!reply || live?.gate.leaked || replyLeaks(reply, language, sanskrit)) {
      if (live?.gate.emitted) emit?.({ type: 'reset' });
      calls += 1;
      const note = [baseNote, reply ? RETRY_GUIDANCE_LEAK : RETRY_NOT_JSON].filter(Boolean).join('\n\n');
      reply = parseReply(await writeReply(message, history, situation, verses, crisis, note, undefined, profile, memories));
    }
  } catch (error) {
    console.info(JSON.stringify({ event: 'write_failed', detail: safeErrorMessage(error) }));
    reply = null;
  }
  let replyLanguage = language;
  if (!reply || replyLeaks(reply, language, sanskrit)) {
    reply = { acknowledge: verses.length > 0 ? FIXED_LEAD_IN : SAFE_NO_MATCH, connection: '', step: '' };
    replyLanguage = 'en';
  }
  if (verses.length === 0) reply = { ...reply, connection: '' };
  reply = { ...reply, acknowledge: tidyOpener(stripEchoedInput(reply.acknowledge, message, replyLanguage)) };

  return { status, reply, verses, crisis, language: replyLanguage, calls, debug };
}
