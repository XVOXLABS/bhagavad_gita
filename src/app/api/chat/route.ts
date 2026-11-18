import { randomUUID } from 'node:crypto';
import { type DisplayVerse } from '@/lib/corpus';
import { extractMemories, safeErrorMessage } from '@/lib/llm';
import { type CompanionMemory, type MemoryCategory, MEMORY_CATEGORIES } from '@/lib/memory';
import { type DevoteeProfile } from '@/lib/profile';
import { speakableText } from '@/lib/speech';
import { respond, type ChatResult } from '@/lib/pipeline';
import { CRISIS_MESSAGE, HELPLINES, mentionsCrisis } from '@/lib/safety';
import { appendSession, clearSession, getSession } from '@/lib/session';
import type { PipelineEvent } from '@/lib/stream-reply';
import { replyText, type Reply } from '@/lib/verify';

export const runtime = 'nodejs';
// Up to five model calls plus an embedding; the default serverless limit can be too short.
export const maxDuration = 60;

const MAX_MESSAGE_LENGTH = 2000;
const UNAVAILABLE_GUIDANCE = 'The reply could not be completed. Please try again.';

export type FinishedTurn = {
  status: ChatResult['status'];
  guidance: string;
  reply?: Reply;
  replyId?: string;
  verses: DisplayVerse[];
  language?: string;
  crisis: { message: string; helplines: typeof HELPLINES } | null;
  usage: { calls: number };
  newMemories?: { fact: string; category: MemoryCategory; associatedVerse?: string }[];
};

type ChatBody = {
  sessionId?: unknown;
  message?: unknown;
  reset?: unknown;
  stream?: unknown;
  profile?: unknown;
  memories?: unknown;
};

function parseMemories(raw: unknown): CompanionMemory[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((obj) => {
      const cat =
        typeof obj.category === 'string' && obj.category in MEMORY_CATEGORIES
          ? (obj.category as MemoryCategory)
          : 'struggle';
      return {
        id: typeof obj.id === 'string' ? obj.id : String(Date.now()),
        fact: String(obj.fact || '').slice(0, 200).trim(),
        category: cat,
        createdAt: typeof obj.createdAt === 'number' ? obj.createdAt : Date.now(),
        associatedVerse: typeof obj.associatedVerse === 'string' ? obj.associatedVerse : undefined,
        active: obj.active !== false,
      };
    })
    .filter((m) => m.fact.length >= 3)
    .slice(0, 30);
}

function parseProfile(raw: unknown): DevoteeProfile | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const data = raw as Record<string, unknown>;
  const persona =
    data.persona === 'guru' || data.persona === 'margadarshi' ? data.persona : 'sakha';
  return {
    preferredName: typeof data.preferredName === 'string' ? data.preferredName.slice(0, 50).trim() : undefined,
    persona,
    language: typeof data.language === 'string' ? data.language.slice(0, 10).trim() : undefined,
    lifeContext: typeof data.lifeContext === 'string' ? data.lifeContext.slice(0, 200).trim() : undefined,
  };
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function crisisBlock(crisis: boolean) {
  return crisis ? { message: CRISIS_MESSAGE, helplines: HELPLINES } : null;
}

function unavailable(crisis: boolean, calls: number): FinishedTurn {
  return {
    status: 'unavailable' as const,
    guidance: UNAVAILABLE_GUIDANCE,
    verses: [],
    crisis: crisisBlock(crisis),
    usage: { calls },
  };
}

/** Saves the turn (with the text the TTS route may speak) and builds the response body. */
function finish(sessionId: string, message: string, result: ChatResult): FinishedTurn {
  if (result.debug.dropped.length > 0) {
    console.info(JSON.stringify({ event: 'citation_rejected', dropped: result.debug.dropped, status: result.status }));
  }
  if (result.status === 'unavailable') return unavailable(result.crisis, result.calls);

  const guidance = replyText(result.reply);
  const replyId = randomUUID();
  appendSession(sessionId, [
    { role: 'user', content: message },
    {
      role: 'assistant',
      content: guidance,
      citations: result.verses.map((verse) => `${verse.chapter}.${verse.verse}`),
      language: result.language,
      replyId,
      speech: speakableText(result.reply, result.crisis ? CRISIS_MESSAGE : undefined, result.language),
    },
  ]);

  return {
    status: result.status,
    guidance,
    reply: result.reply,
    replyId,
    verses: result.verses,
    language: result.language,
    crisis: crisisBlock(result.crisis),
    usage: { calls: result.calls },
  };
}

function failed(message: string, error: unknown) {
  console.info(JSON.stringify({ event: 'chat_unavailable', detail: safeErrorMessage(error) }));
  return unavailable(mentionsCrisis(message), 0);
}

/** One JSON event per line: stage, verses, delta, reset, then a final "done" carrying the full reply. */
function streamReply(
  request: Request,
  sessionId: string,
  message: string,
  profile?: DevoteeProfile,
  memories?: CompanionMemory[],
): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: unknown) => {
        if (!open || request.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false;
        }
      };
      const emit = (event: PipelineEvent) =>
        send(event.type === 'verses' ? { ...event, crisis: crisisBlock(event.crisis) } : event);

      let done;
      try {
        // The turn is saved even if the reader has gone, so the session history stays complete.
        const result = await respond(message, getSession(sessionId), emit, profile, memories);
        done = finish(sessionId, message, result);
        if (done.status !== 'unavailable') {
          const verseKey = result.verses.length > 0 ? `${result.verses[0].chapter}.${result.verses[0].verse}` : undefined;
          const newMemories = await extractMemories(message, done.guidance, memories, verseKey);
          if (newMemories.length > 0) {
            done = { ...done, newMemories };
          }
        }
      } catch (error) {
        done = failed(message, error);
      }
      send({ type: 'done', ...done });
      if (open) {
        open = false;
        try {
          controller.close();
        } catch {
          // Already closed by a disconnect.
        }
      }
    },
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return json({ error: 'Invalid JSON.' }, 400);
  }

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  if (!sessionId || sessionId.length > 80) {
    return json({ error: 'A session id is required.' }, 400);
  }

  if (body.reset === true) {
    clearSession(sessionId);
    return json({ status: 'reset' });
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return json({ error: 'Message is empty.' }, 400);
  if (message.length > MAX_MESSAGE_LENGTH) {
    return json({ error: 'Message is too long.' }, 400);
  }

  const profile = parseProfile(body.profile);
  const memories = parseMemories(body.memories);

  if (body.stream === true) return streamReply(request, sessionId, message, profile, memories);

  try {
    const result = await respond(message, getSession(sessionId), undefined, profile, memories);
    let done = finish(sessionId, message, result);
    if (done.status !== 'unavailable') {
      const verseKey = result.verses.length > 0 ? `${result.verses[0].chapter}.${result.verses[0].verse}` : undefined;
      const newMemories = await extractMemories(message, done.guidance, memories, verseKey);
      if (newMemories.length > 0) {
        done = { ...done, newMemories };
      }
    }
    return json(done);
  } catch (error) {
    return json(failed(message, error));
  }
}
