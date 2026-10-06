import { randomUUID } from 'node:crypto';
import { safeErrorMessage } from '@/lib/llm';
import { speakableText } from '@/lib/speech';
import { respond, type ChatResult } from '@/lib/pipeline';
import { CRISIS_MESSAGE, HELPLINES, mentionsCrisis } from '@/lib/safety';
import { appendSession, clearSession, getSession } from '@/lib/session';
import type { PipelineEvent } from '@/lib/stream-reply';
import { replyText } from '@/lib/verify';

export const runtime = 'nodejs';
// Up to five model calls plus an embedding; the default serverless limit can be too short.
export const maxDuration = 60;

const MAX_MESSAGE_LENGTH = 2000;
const UNAVAILABLE_GUIDANCE = 'The reply could not be completed. Please try again.';

type ChatBody = {
  sessionId?: unknown;
  message?: unknown;
  reset?: unknown;
  stream?: unknown;
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function crisisBlock(crisis: boolean) {
  return crisis ? { message: CRISIS_MESSAGE, helplines: HELPLINES } : null;
}

function unavailable(crisis: boolean, calls: number) {
  return {
    status: 'unavailable' as const,
    guidance: UNAVAILABLE_GUIDANCE,
    verses: [],
    crisis: crisisBlock(crisis),
    usage: { calls },
  };
}

/** Saves the turn (with the text the TTS route may speak) and builds the response body. */
function finish(sessionId: string, message: string, result: ChatResult) {
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
function streamReply(request: Request, sessionId: string, message: string): Response {
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
        done = finish(sessionId, message, await respond(message, getSession(sessionId), emit));
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

  if (body.stream === true) return streamReply(request, sessionId, message);

  try {
    return json(finish(sessionId, message, await respond(message, getSession(sessionId))));
  } catch (error) {
    return json(failed(message, error));
  }
}
