import type { DisplayVerse } from './corpus';
import { embedQuery } from './embed';
import { extractSituation, safeErrorMessage, selectVerses, writeReply } from './llm';
import {
  FIXED_LEAD_IN,
  RETRY_BAD_CITATIONS,
  RETRY_DIFFERENT_VERSE,
  RETRY_GUIDANCE_LEAK,
  RETRY_NOT_JSON,
  SAFE_NO_MATCH,
} from './prompt';
import { buildShortlist, queryText, type Shortlist, type Situation } from './retrieve';
import { mentionsCrisis } from './safety';
import type { SessionMessage } from './session';
import {
  citesOnlyPrior,
  evaluateSelection,
  fallbackSituation,
  parseReply,
  parseSelection,
  parseSituation,
  replyLeaks,
  type Reply,
  type SelectionResult,
} from './verify';

export type ChatResult = {
  status: 'answered' | 'no_strong_match' | 'unavailable';
  reply: Reply;
  verses: DisplayVerse[];
  crisis: boolean;
  calls: number;
  debug: {
    situation: Situation;
    shortlist: string[];
    mode: Shortlist['mode'];
    reason: string;
    dropped: string[];
  };
};

const EMPTY_REPLY: Reply = { acknowledge: '', connection: '', step: '' };

function refsOf(verses: DisplayVerse[]): string[] {
  return verses.map((verse) => `${verse.chapter}.${verse.verse}`);
}

export async function respond(message: string, history: SessionMessage[]): Promise<ChatResult> {
  let calls = 0;
  const priorRefs = [...new Set(history.flatMap((turn) => turn.citations ?? []))];

  let situation: Situation;
  try {
    calls += 1;
    situation = parseSituation(await extractSituation(message, history), message);
  } catch (error) {
    console.info(JSON.stringify({ event: 'situation_failed', detail: safeErrorMessage(error) }));
    situation = fallbackSituation(message);
  }
  const crisis = mentionsCrisis(message) || situation.crisis;

  const queryVector = await embedQuery(queryText(message, situation));
  const shortlist = buildShortlist({
    message,
    situation,
    queryVector,
    pinnedRefs: situation.continuesPrevious ? priorRefs : [],
  });
  console.info(
    JSON.stringify({ event: 'verse_shortlist', mode: shortlist.mode, count: shortlist.refs.length, refs: shortlist.refs.slice(0, 8) }),
  );

  const debug: ChatResult['debug'] = { situation, shortlist: shortlist.refs, mode: shortlist.mode, reason: '', dropped: [] };

  async function select(note?: string): Promise<{ result: SelectionResult; reason: string } | null> {
    calls += 1;
    const parsed = parseSelection(await selectVerses(message, situation, shortlist, priorRefs, note));
    if (!parsed) return null;
    const result = evaluateSelection(parsed, shortlist.refs);
    debug.dropped.push(...result.dropped);
    return { result, reason: parsed.reason };
  }

  let chosen: { result: SelectionResult; reason: string } | null;
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
    return { status: 'unavailable', reply: EMPTY_REPLY, verses: [], crisis, calls, debug };
  }

  const verses = chosen?.result.status === 'answered' ? chosen.result.verses : [];
  debug.reason = chosen?.reason ?? '';
  const status: ChatResult['status'] = verses.length > 0 ? 'answered' : 'no_strong_match';

  let reply: Reply | null = null;
  try {
    calls += 1;
    reply = parseReply(await writeReply(message, history, situation, verses, crisis));
    if (!reply || replyLeaks(reply)) {
      calls += 1;
      const note = reply ? RETRY_GUIDANCE_LEAK : RETRY_NOT_JSON;
      reply = parseReply(await writeReply(message, history, situation, verses, crisis, note));
    }
  } catch (error) {
    console.info(JSON.stringify({ event: 'write_failed', detail: safeErrorMessage(error) }));
    reply = null;
  }
  if (!reply || replyLeaks(reply)) {
    reply = { acknowledge: verses.length > 0 ? FIXED_LEAD_IN : SAFE_NO_MATCH, connection: '', step: '' };
  }
  if (verses.length === 0) reply = { ...reply, connection: '' };

  return { status, reply, verses, crisis, calls, debug };
}
