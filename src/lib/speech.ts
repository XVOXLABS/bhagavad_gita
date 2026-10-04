export type SpeakableReply = { acknowledge: string; connection: string; step: string };

export type VoiceLike = { name: string; lang: string; default?: boolean };

export const VOICE_RATE = 0.92;
export const VOICE_PITCH = 0.9;

/** Languages written in Devanagari; for every other language, Devanagari can only be Sanskrit and is skipped. */
const DEVANAGARI_SPEECH = new Set(['hi', 'mr']);

function clean(text: string, language: string): string {
  const withoutSanskrit = DEVANAGARI_SPEECH.has(language) ? text : text.replace(/[ऀ-ॿ]+/g, '');
  return withoutSanskrit
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\b\d{1,2}\s*\.\s*\d{1,3}\b/g, '')
    .replace(/[*_#`>~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sentence(text: string, language: string): string {
  const value = clean(text, language);
  if (!value) return '';
  return /[.!?।]$/.test(value) ? value : `${value}.`;
}

/** Krishna's words in speaking order. Sanskrit and verse numbers are left out; browser voices cannot say them well. */
export function speakableText(reply: SpeakableReply, lead?: string, language = 'en'): string {
  const parts = [lead ? sentence(lead, 'en') : '', sentence(reply.acknowledge, language), sentence(reply.connection, language)];
  const step = sentence(reply.step, language);
  if (step) parts.push(language === 'en' ? `One step for today. ${step}` : step);
  return parts.filter(Boolean).join(' ');
}

/** A device voice for a non-English reply, or null so the browser picks one from the utterance's language. */
export function voiceForLanguage<T extends VoiceLike>(voices: T[], language: string): T | null {
  if (language === 'en') return null;
  const matching = voices.filter((voice) => langOf(voice).startsWith(language));
  return matching.find((voice) => langOf(voice) === `${language}-in`) ?? matching[0] ?? null;
}

/** Chrome stops utterances after about 15 seconds, so long text is spoken as a queue of short chunks. */
export function chunkSentences(text: string, max = 180): string[] {
  const sentences = text.split(/(?<=[.!?।])\s+/).map((part) => part.trim()).filter(Boolean);
  const pieces: string[] = [];
  for (const item of sentences) {
    if (item.length <= max) {
      pieces.push(item);
      continue;
    }
    let current = '';
    for (const word of item.split(/\s+/)) {
      if (current && current.length + word.length + 1 > max) {
        pieces.push(current);
        current = word;
      } else {
        current = current ? `${current} ${word}` : word;
      }
    }
    if (current) pieces.push(current);
  }

  const chunks: string[] = [];
  let current = '';
  for (const piece of pieces) {
    if (current && current.length + piece.length + 1 > max) {
      chunks.push(current);
      current = piece;
    } else {
      current = current ? `${current} ${piece}` : piece;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

const CALM_MALE = /ravi|prabhat|hemant|madhur|rishi|male|daniel|george|arthur|guy|ryan|thomas|oliver/i;

function langOf(voice: VoiceLike): string {
  return voice.lang.replace('_', '-').toLowerCase();
}

/** The saved voice if it still exists, else the calmest likely Indian-English male voice on this device. */
export function pickVoice<T extends VoiceLike>(voices: T[], saved?: string | null): T | null {
  if (voices.length === 0) return null;
  if (saved) {
    const found = voices.find((voice) => voice.name === saved);
    if (found) return found;
  }
  const english = voices.filter((voice) => langOf(voice).startsWith('en'));
  const indian = english.filter((voice) => langOf(voice) === 'en-in');
  const british = english.filter((voice) => langOf(voice) === 'en-gb');
  return (
    indian.find((voice) => CALM_MALE.test(voice.name)) ??
    indian[0] ??
    british.find((voice) => CALM_MALE.test(voice.name)) ??
    english.find((voice) => CALM_MALE.test(voice.name)) ??
    english.find((voice) => voice.default) ??
    english[0] ??
    voices.find((voice) => voice.default) ??
    voices[0]
  );
}

export type TalkMode = 'off' | 'listening' | 'thinking' | 'speaking' | 'paused';

export type TalkState = {
  mode: TalkMode;
  misses: number;
  pauseAfterSpeaking: boolean;
  /** Increments on every new listening turn so the browser hook starts a fresh recognition. */
  turn: number;
  note: string;
};

export type TalkEvent =
  | { type: 'start' }
  | { type: 'heard'; text: string }
  | { type: 'silence' }
  | { type: 'replied'; pause: boolean }
  | { type: 'doneSpeaking' }
  | { type: 'interrupt' }
  | { type: 'failed'; note: string }
  | { type: 'end' };

export const MAX_SILENT_TURNS = 2;

export const TALK_OFF: TalkState = { mode: 'off', misses: 0, pauseAfterSpeaking: false, turn: 0, note: '' };

function listen(state: TalkState, misses = 0): TalkState {
  return { mode: 'listening', misses, pauseAfterSpeaking: false, turn: state.turn + 1, note: '' };
}

export function nextTalkState(state: TalkState, event: TalkEvent): TalkState {
  if (event.type === 'end') return { ...TALK_OFF, turn: state.turn };
  switch (state.mode) {
    case 'off':
    case 'paused':
      return event.type === 'start' || event.type === 'interrupt' ? listen(state) : state;
    case 'listening':
      if (event.type === 'heard') {
        return event.text.trim() ? { ...state, mode: 'thinking', misses: 0 } : nextTalkState(state, { type: 'silence' });
      }
      if (event.type === 'silence') {
        const misses = state.misses + 1;
        return misses >= MAX_SILENT_TURNS
          ? { ...state, mode: 'paused', misses, note: 'I am here whenever you are ready. Tap to continue.' }
          : listen(state, misses);
      }
      if (event.type === 'failed') return { ...state, mode: 'paused', note: event.note };
      return state;
    case 'thinking':
      if (event.type === 'replied') return { ...state, mode: 'speaking', pauseAfterSpeaking: event.pause };
      if (event.type === 'failed') return { ...state, mode: 'paused', note: event.note };
      return state;
    case 'speaking':
      if (event.type === 'doneSpeaking') {
        return state.pauseAfterSpeaking ? { ...state, mode: 'paused', note: 'Tap to continue when you are ready.' } : listen(state);
      }
      if (event.type === 'interrupt') return listen(state);
      return state;
    default:
      return state;
  }
}
