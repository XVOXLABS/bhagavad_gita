import { lookup, toDisplay, type DisplayVerse } from './corpus';
import { embedQuery } from './embed';
import { extractSituation, safeErrorMessage, selectVerses, writeConversation, writeReply } from './llm';
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
function streamer(emit: Emit | undefined, keys: typeof REPLY_KEYS, language: string, sanskrit: string[] = []) {
  if (!emit) return null;
  const gate = new SentenceGate(keys, language, sanskrit);
  return {
    gate,
    onText: (soFar: string) => {
      for (const delta of gate.push(soFar)) emit({ type: 'delta', ...delta });
    },
  };
}

/**
 * Runs the whole reply. With `emit`, progress, the chosen verse and the reply's verified sentences are
 * reported as they happen; the returned result is still the final, authoritative reply.
 */
export async function respond(message: string, history: SessionMessage[], emit?: Emit): Promise<ChatResult> {
  let calls = 0;
  const priorRefs = [...new Set(history.flatMap((turn) => turn.citations ?? []))];
  const previousLanguage = lastLanguage(history);

  emit?.({ type: 'stage', stage: 'understanding' });
  let situation: Situation;
  try {
    calls += 1;
    situation = parseSituation(await extractSituation(message, history), message, previousLanguage);
  } catch (error) {
    console.info(JSON.stringify({ event: 'situation_failed', detail: safeErrorMessage(error) }));
    situation = fallbackSituation(message, previousLanguage);
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
    const live = streamer(emit, CONVERSE_KEYS, language);
    let text: string | null = null;
    try {
      calls += 1;
      text = parseConversation(await writeConversation(message, history, situation, live?.onText));
    } catch (error) {
      console.info(JSON.stringify({ event: 'converse_failed', detail: safeErrorMessage(error) }));
    }
    if (!text || live?.gate.leaked || guidanceLeaks(text, language)) {
      if (live?.gate.emitted) emit?.({ type: 'reset' });
      text = FALLBACK_CONVERSE;
    }
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
    const queryVector = await embedQuery(queryText(message, situation));
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
        !situation.continuesPrevious &&
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
  const live = streamer(emit, keys, language, sanskrit);

  let reply: Reply | null = null;
  try {
    calls += 1;
    reply = parseReply(await writeReply(message, history, situation, verses, crisis, baseNote, live?.onText));
    if (!reply || live?.gate.leaked || replyLeaks(reply, language, sanskrit)) {
      if (live?.gate.emitted) emit?.({ type: 'reset' });
      calls += 1;
      const note = [baseNote, reply ? RETRY_GUIDANCE_LEAK : RETRY_NOT_JSON].filter(Boolean).join('\n\n');
      reply = parseReply(await writeReply(message, history, situation, verses, crisis, note));
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
  reply = { ...reply, acknowledge: tidyOpener(reply.acknowledge) };

  return { status, reply, verses, crisis, language: replyLanguage, calls, debug };
}
