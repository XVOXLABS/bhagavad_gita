import { safeErrorMessage } from '@/lib/llm';
import { respond } from '@/lib/pipeline';
import { CRISIS_MESSAGE, HELPLINES, mentionsCrisis } from '@/lib/safety';
import { appendSession, clearSession, getSession } from '@/lib/session';
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
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function crisisBlock(crisis: boolean) {
  return crisis ? { message: CRISIS_MESSAGE, helplines: HELPLINES } : null;
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

  const history = getSession(sessionId);

  try {
    const result = await respond(message, history);

    if (result.debug.dropped.length > 0) {
      console.info(JSON.stringify({ event: 'citation_rejected', dropped: result.debug.dropped, status: result.status }));
    }

    if (result.status === 'unavailable') {
      return json({
        status: 'unavailable',
        guidance: UNAVAILABLE_GUIDANCE,
        verses: [],
        crisis: crisisBlock(result.crisis),
        usage: { calls: result.calls },
      });
    }

    const guidance = replyText(result.reply);
    appendSession(sessionId, [
      { role: 'user', content: message },
      { role: 'assistant', content: guidance, citations: result.verses.map((verse) => `${verse.chapter}.${verse.verse}`) },
    ]);

    return json({
      status: result.status,
      guidance,
      reply: result.reply,
      verses: result.verses,
      crisis: crisisBlock(result.crisis),
      usage: { calls: result.calls },
    });
  } catch (error) {
    console.info(JSON.stringify({ event: 'chat_unavailable', detail: safeErrorMessage(error) }));
    return json({
      status: 'unavailable',
      guidance: UNAVAILABLE_GUIDANCE,
      verses: [],
      crisis: crisisBlock(mentionsCrisis(message)),
      usage: { calls: 0 },
    });
  }
}
