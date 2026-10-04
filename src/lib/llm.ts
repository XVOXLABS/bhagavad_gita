import OpenAI from 'openai';
import type { DisplayVerse } from './corpus';
import { redactJina } from './embed';
import { CRISIS_NOTE, SELECT_PROMPT, SITUATION_PROMPT, WRITE_PROMPT } from './prompt';
import type { Shortlist, Situation } from './retrieve';
import type { SessionMessage } from './session';
import { themeLabel } from './themes';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

let client: OpenAI | null = null;

export function modelName(): string {
  return process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b';
}

function getClient(): OpenAI {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error('GROQ_API_KEY is not set');
  client ??= new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });
  return client;
}

export function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'request failed';
  return redactJina(message)
    .replace(/AIza[\w-]+/g, '[redacted]')
    .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/gsk_[A-Za-z0-9]+/g, '[redacted]')
    .slice(0, 300);
}

type Turn = { role: 'user' | 'assistant'; content: string };

async function complete(
  step: string,
  system: string,
  turns: Turn[],
  options: { temperature: number; maxTokens: number },
): Promise<string> {
  const model = modelName();
  const response = await getClient().chat.completions.create({
    model,
    temperature: options.temperature,
    max_completion_tokens: options.maxTokens,
    response_format: { type: 'json_object' },
    ...(model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' as const } : {}),
    messages: [{ role: 'system', content: system }, ...turns],
  });
  const text = response.choices[0]?.message?.content?.trim();
  if (!text) throw new Error(`The model returned an empty reply (${step})`);
  const usage = response.usage;
  if (typeof usage?.prompt_tokens === 'number') {
    console.info(
      JSON.stringify({
        event: 'groq_usage',
        step,
        model,
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
      }),
    );
  }
  return text;
}

function recentHistory(history: SessionMessage[], limit = 6): Turn[] {
  return history.slice(-limit).map((turn) => ({ role: turn.role, content: turn.content }));
}

function describeSituation(situation: Situation): string {
  const lines = [`Situation: ${situation.situation}`];
  if (situation.emotions.length > 0) lines.push(`Feelings: ${situation.emotions.join(', ')}`);
  if (situation.need) lines.push(`Needs: ${situation.need}`);
  if (situation.themes.length > 0) lines.push(`Themes: ${situation.themes.map(themeLabel).join(', ')}`);
  return lines.join('\n');
}

export async function extractSituation(message: string, history: SessionMessage[]): Promise<string> {
  const earlier = recentHistory(history, 4)
    .map((turn) => `${turn.role === 'user' ? 'Person' : 'Counsellor'}: ${turn.content}`)
    .join('\n');
  const content = earlier ? `Earlier conversation:\n${earlier}\n\nNew message:\n${message}` : message;
  return complete('situation', SITUATION_PROMPT, [{ role: 'user', content }], { temperature: 0, maxTokens: 600 });
}

export async function selectVerses(
  message: string,
  situation: Situation,
  shortlist: Shortlist,
  priorRefs: string[],
  note?: string,
): Promise<string> {
  const parts = [
    `The person wrote:\n${message}`,
    describeSituation(situation),
    `Shortlist (${shortlist.refs.length} verses):\n${shortlist.document}`,
  ];
  if (priorRefs.length > 0) {
    parts.push(
      `Verses already given earlier in this conversation: ${priorRefs.join(', ')}. ${
        situation.continuesPrevious
          ? 'The person is continuing that topic, so an earlier verse may be kept if it is still the best fit.'
          : 'This looks like a new situation, so prefer a different verse.'
      }`,
    );
  }
  if (note) parts.push(note);
  return complete('select', SELECT_PROMPT, [{ role: 'user', content: parts.join('\n\n') }], {
    temperature: 0,
    maxTokens: 700,
  });
}

function describeVerse(verse: DisplayVerse): string {
  const lines = [`Meaning: ${verse.summary ?? 'not available'}`];
  if (verse.englishTranslation) lines.push(`Translation: ${verse.englishTranslation}`);
  return lines.join('\n');
}

export async function writeReply(
  message: string,
  history: SessionMessage[],
  situation: Situation,
  verses: DisplayVerse[],
  crisis: boolean,
  note?: string,
): Promise<string> {
  const parts = [
    describeSituation(situation),
    verses.length > 0
      ? `Chosen verse${verses.length > 1 ? 's' : ''}:\n${verses.map(describeVerse).join('\n---\n')}`
      : 'No verse was chosen: none fits this with confidence.',
  ];
  if (crisis) parts.push(CRISIS_NOTE);
  if (note) parts.push(note);
  parts.push(`The person wrote:\n${message}`);
  return complete(
    'write',
    WRITE_PROMPT,
    [...recentHistory(history), { role: 'user', content: parts.join('\n\n') }],
    { temperature: 0.6, maxTokens: 900 },
  );
}
