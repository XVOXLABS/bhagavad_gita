import type { DisplayVerse } from './corpus';
import { guidanceLeaks, tidyOpener } from './verify';

export type ReplyField = 'acknowledge' | 'connection' | 'step';
export type Stage = 'understanding' | 'searching' | 'choosing' | 'writing';

/** What the pipeline reports while it works; the chat route turns these into NDJSON lines. */
export type PipelineEvent =
  | { type: 'stage'; stage: Stage }
  | { type: 'verses'; verses: DisplayVerse[]; crisis: boolean }
  | { type: 'delta'; field: ReplyField; text: string }
  | { type: 'reset' };

export type PartialField = { text: string; closed: boolean };

/** Finds where the string value of `"key":` starts, ignoring escaped quotes inside other values. */
function valueStart(raw: string, key: string): number {
  const pattern = new RegExp(`"${key}"\\s*:\\s*"`, 'g');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw))) {
    if (match.index === 0 || raw[match.index - 1] !== '\\') return match.index + match[0].length;
  }
  return -1;
}

const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '', b: '', f: '', '"': '"', '\\': '\\', '/': '/' };

/** Decodes a JSON string from `start` up to its closing quote, or to the end of an unfinished stream. */
function readString(raw: string, start: number): PartialField {
  let text = '';
  for (let i = start; i < raw.length; i += 1) {
    const char = raw[i];
    if (char === '"') return { text, closed: true };
    if (char !== '\\') {
      text += char;
      continue;
    }
    const next = raw[i + 1];
    if (next === undefined) break;
    if (next === 'u') {
      const hex = raw.slice(i + 2, i + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) break;
      text += String.fromCharCode(parseInt(hex, 16));
      i += 5;
    } else {
      text += ESCAPES[next] ?? next;
      i += 1;
    }
  }
  return { text, closed: false };
}

/** Reads the named string fields out of a JSON object that is still being generated. */
export function partialFields(raw: string, keys: string[]): Record<string, PartialField> {
  const fields: Record<string, PartialField> = {};
  for (const key of keys) {
    const start = valueStart(raw, key);
    fields[key] = start < 0 ? { text: '', closed: false } : readString(raw, start);
  }
  return fields;
}

/** A sentence ends at . ! ? । ॥ followed by whitespace; "2.47" or "Mr.X" never split. */
const SENTENCE_END = /[.!?।॥]["')\]]*(?=\s)/g;

function lastSentenceEnd(text: string): number {
  let end = -1;
  let match: RegExpExecArray | null;
  SENTENCE_END.lastIndex = 0;
  while ((match = SENTENCE_END.exec(text))) end = match.index + match[0].length;
  return end;
}

/**
 * Lets streamed text through only in whole sentences, and only after each one passes the same
 * leak check the finished reply gets. One leak stops the stream; the caller then retries.
 */
export class SentenceGate {
  private released: Record<string, number> = {};
  leaked = false;
  emitted = false;

  constructor(
    private readonly keys: { key: string; field: ReplyField }[],
    private readonly language: string,
    private readonly sanskrit: string[] = [],
  ) {}

  push(raw: string): { field: ReplyField; text: string }[] {
    if (this.leaked) return [];
    const fields = partialFields(
      raw,
      this.keys.map((entry) => entry.key),
    );
    const out: { field: ReplyField; text: string }[] = [];
    for (const [index, { key, field }] of this.keys.entries()) {
      const { text, closed } = fields[key];
      const from = this.released[key] ?? 0;
      const end = closed ? text.length : lastSentenceEnd(text);
      if (end <= from) continue;
      let chunk = text.slice(from, end);
      if (from === 0) {
        chunk = chunk.trimStart();
        if (index === 0) chunk = tidyOpener(chunk);
      }
      if (!chunk.trim()) {
        this.released[key] = end;
        continue;
      }
      if (guidanceLeaks(chunk, this.language, this.sanskrit)) {
        this.leaked = true;
        return out;
      }
      this.released[key] = end;
      this.emitted = true;
      out.push({ field, text: chunk });
    }
    return out;
  }
}

export const REPLY_KEYS: { key: string; field: ReplyField }[] = [
  { key: 'acknowledge', field: 'acknowledge' },
  { key: 'connection', field: 'connection' },
  { key: 'step', field: 'step' },
];

/** Conversational replies are one "reply" field, shown where the acknowledgement goes. */
export const CONVERSE_KEYS: { key: string; field: ReplyField }[] = [{ key: 'reply', field: 'acknowledge' }];
