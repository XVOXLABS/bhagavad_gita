'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { DisplayVerse } from '@/lib/corpus';
import { KRISHNA_GREETING } from '@/lib/greeting';
import { speakableText } from '@/lib/speech';
import { avatarEngine } from '../avatar/anam-engine';
import { useAvatarState } from '../avatar/krishna-avatar';
import { dropPref, useCompanion } from '../companion-store';
import { useSavedVerses, verseRef } from '../saved';
import { shareVerse } from '../share-card';
import { uid } from '../uid';
import {
  micErrorMessage,
  readPref,
  useDictation,
  useKrishnaVoice,
  useRecorder,
  useTalkMode,
  writePref,
  type Listener,
  type TalkTurn,
} from '../use-speech';
import type { VerseActions } from '../verse-card';

export type Reply = { acknowledge: string; connection: string; step: string; question?: string };

export type Crisis = { message: string; helplines: { name: string; number: string; note: string }[] } | null;

export type Stage = 'understanding' | 'searching' | 'choosing' | 'writing';

/** Lines of the streamed /api/chat response; "done" carries the same body as the plain JSON reply. */
type StreamEvent =
  | { type: 'stage'; stage: Stage }
  | { type: 'verses'; verses: DisplayVerse[]; crisis: Crisis }
  | { type: 'delta'; field: keyof Reply; text: string }
  | { type: 'reset' }
  | ({ type: 'done' } & ChatResponse);

type ChatStatus = 'answered' | 'no_strong_match' | 'conversation' | 'unavailable';

type ChatResponse = {
  status: ChatStatus;
  guidance: string;
  reply?: Reply;
  verses: DisplayVerse[];
  crisis?: Crisis;
  language?: string;
  replyId?: string;
  /** New things Krishna will remember; kept on this device. */
  remember?: string[];
  error?: string;
};

export type UiMessage =
  | { id: string; role: 'user'; text: string }
  | {
      id: string;
      role: 'assistant';
      reply: Reply;
      verses: DisplayVerse[];
      crisis: Crisis;
      language: string;
      status: 'answered' | 'no_strong_match' | 'conversation';
      replyId?: string;
      /** True while the reply is still arriving; Listen waits for the finished reply. */
      streaming?: boolean;
    }
  | { id: string; role: 'error'; text: string; crisis: Crisis };

export type AssistantMessage = Extract<UiMessage, { role: 'assistant' }>;

export type AskPrompt = 'open' | 'question' | 'verse' | 'more';

/** Where the guided conversation is. Lives above the routes, so reading a verse never loses it. */
export type Flow =
  | { at: 'entrance' }
  | { at: 'name' }
  | { at: 'tone' }
  | { at: 'know' }
  | { at: 'intro'; step: number; short?: boolean }
  | { at: 'choices' }
  | { at: 'compassion' }
  /** `text` is Krishna's own question from his last reply, shown in place of the fixed line. */
  | { at: 'ask'; prompt: AskPrompt; text?: string }
  | { at: 'guidance' }
  | { at: 'reply'; beat: number };

export type Panel = 'none' | 'transcript' | 'settings' | 'memory';

export const MIC_LANGS = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'hi-IN', label: 'Hindi' },
  { code: 'ta-IN', label: 'Tamil' },
];

const UNAVAILABLE_TEXT = 'The reply could not be completed. Please try again.';
const UNAVAILABLE_SPOKEN = 'Let us pause for a moment. Please try again in a little while.';
const AUTOPLAY_KEY = 'gita.autoplay';
const NATURAL_KEY = 'gita.naturalVoice';
const AVATAR_KEY = 'gita.avatar';
const MIC_LANG_KEY = 'gita.micLang';
const MEMORY_ON_KEY = 'gita.memoryOn';
const NAME_KEY = 'gita.name';
const THREAD_KEY = 'gita.thread';
const ENTERED_KEY = 'gita.entered';
/** The most messages kept on the device for the next visit. */
const MAX_KEPT_MESSAGES = 80;
/** Longest wait for the face before a line is spoken by voice alone. */
const FACE_WAIT_MS = 6000;
/** The live face is closed this long after Krishna stops speaking, to save session minutes. */
const FACE_IDLE_MS = 45_000;

/** True once the person has tapped or typed on the page; before that browsers block sound. */
function hasUserActivation(): boolean {
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return activation ? activation.hasBeenActive : true;
}

/** Reads NDJSON events as they arrive and resolves with the final "done" body. */
async function readStream(body: ReadableStream<Uint8Array>, onEvent: (event: StreamEvent) => void): Promise<ChatResponse | null> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done: ChatResponse | null = null;
  const handle = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as StreamEvent;
    if (event.type === 'done') done = event;
    else onEvent(event);
  };
  for (;;) {
    const { value, done: finished } = await reader.read();
    if (finished) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      handle(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
    }
  }
  handle(buffer + decoder.decode());
  return done;
}

function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string | null): void {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    // Storage blocked: the conversation lasts until this tab reloads.
  }
}

type Thread = { sessionId: string; messages: UiMessage[] };

function parseThread(raw: string | null): Thread | null {
  if (!raw) return null;
  try {
    const thread = JSON.parse(raw) as Thread;
    return thread.sessionId && Array.isArray(thread.messages) && thread.messages.length > 0 ? thread : null;
  } catch {
    return null;
  }
}

function useConversationState() {
  const companion = useCompanion();
  const [sessionId, setSessionId] = useState(() => uid());
  const [flow, setFlow] = useState<Flow>({ at: 'entrance' });
  const [panel, setPanel] = useState<Panel>('none');
  const [name, setNameState] = useState('');
  const [sharingRef, setSharingRef] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const savedVerses = useSavedVerses();

  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<'send' | 'reset' | null>(null);
  const [stage, setStage] = useState<Stage>('understanding');
  const [formError, setFormError] = useState('');
  const [autoPlay, setAutoPlay] = useState(false);
  const [micLang, setMicLang] = useState('en-IN');
  const [service, setService] = useState({ tts: false, stt: false, avatar: false });
  const [naturalPref, setNaturalPref] = useState(true);
  const [avatarPref, setAvatarPref] = useState(true);
  const [sttDown, setSttDown] = useState(false);

  const naturalVoice = service.tts && naturalPref;
  const avatarOn = naturalVoice && service.avatar && avatarPref;
  const voice = useKrishnaVoice(naturalVoice, avatarOn);
  const avatarState = useAvatarState();
  const recorder = useRecorder(micLang, service.stt && naturalPref && !sttDown);
  const browserDictation = useDictation(micLang);
  const dictation: Listener = recorder.supported
    ? {
        ...recorder,
        start: (onEnd, options) =>
          recorder.start((result) => {
            if (result.error === 'unavailable') setSttDown(true);
            onEnd(result);
          }, options),
      }
    : browserDictation;
  const autoPlayRef = useRef(autoPlay);
  autoPlayRef.current = autoPlay;

  function flash(text: string) {
    setNotice(text);
    window.setTimeout(() => setNotice((current) => (current === text ? '' : current)), 3200);
  }

  async function share(verse: DisplayVerse) {
    const ref = verseRef(verse);
    setSharingRef(ref);
    try {
      const result = await shareVerse(verse);
      if (result === 'downloaded') flash('Image saved to your downloads');
    } catch {
      flash('The image could not be created. Please try again.');
    } finally {
      setSharingRef(null);
    }
  }

  function actionsFor(verse: DisplayVerse): VerseActions {
    const saved = savedVerses.isSaved(verse);
    return {
      saved,
      sharing: sharingRef === verseRef(verse),
      onToggleSave: () => {
        savedVerses.toggle(verse);
        flash(saved ? 'Removed from My Gita' : 'Saved to My Gita');
      },
      onShare: () => void share(verse),
    };
  }

  function markEntered() {
    writeSession(ENTERED_KEY, '1');
  }

  function setName(value: string) {
    setNameState(value);
    writePref(NAME_KEY, value.trim());
  }

  /** What follows the entrance: first visits are asked a name, returning people are greeted. */
  function finishEntrance() {
    markEntered();
    setFlow(readPref(NAME_KEY) === null ? { at: 'name' } : { at: 'intro', step: 0, short: true });
  }

  useEffect(() => {
    // Krishna speaks unless the person turned his voice off.
    setAutoPlay(readPref(AUTOPLAY_KEY) !== '0');
    setNaturalPref(readPref(NATURAL_KEY) !== '0');
    setAvatarPref(readPref(AVATAR_KEY) !== '0');
    setNameState(readPref(NAME_KEY) ?? '');
    const savedLang = readPref(MIC_LANG_KEY);
    if (savedLang && MIC_LANGS.some((item) => item.code === savedLang)) setMicLang(savedLang);

    // A refresh returns to the conversation, and so does a later visit unless remembering is off.
    const thread = parseThread(readSession(THREAD_KEY)) ?? (readPref(MEMORY_ON_KEY) !== '0' ? parseThread(readPref(THREAD_KEY)) : null);
    if (thread) {
      setSessionId(thread.sessionId);
      setMessages(thread.messages);
    }
    // Within one tab the entrance plays only once.
    if (readSession(ENTERED_KEY) === '1') {
      setFlow((current) => (current.at === 'entrance' ? (thread ? { at: 'ask', prompt: 'more' } : { at: 'choices' }) : current));
    }

    fetch('/api/voice')
      .then((response) => (response.ok ? response.json() : { tts: false, stt: false, avatar: false }))
      .then((data: { tts?: boolean; stt?: boolean; avatar?: boolean }) =>
        setService({ tts: Boolean(data.tts), stt: Boolean(data.stt), avatar: Boolean(data.avatar) }),
      )
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (messages.length === 0 || messages.some((item) => item.role === 'assistant' && item.streaming)) return;
    const thread = JSON.stringify({ sessionId, messages: messages.slice(-MAX_KEPT_MESSAGES) });
    writeSession(THREAD_KEY, thread);
    if (companion.memoryOn) writePref(THREAD_KEY, thread);
  }, [messages, sessionId, companion.memoryOn]);

  /** Turning remembering off also stops the conversation being kept for the next visit. */
  function changeMemoryOn(value: boolean) {
    companion.setMemoryOn(value);
    if (!value) dropPref(THREAD_KEY);
  }

  function ttsUrl(replyId?: string): string | undefined {
    return replyId ? `/api/tts?sessionId=${encodeURIComponent(sessionId)}&replyId=${encodeURIComponent(replyId)}` : undefined;
  }

  async function sendMessage(text: string, fromTalk = false): Promise<TalkTurn> {
    const message = text.trim();
    if (!message) return { speak: '', pause: true };
    setFormError('');
    setPending('send');
    markEntered();
    if (!fromTalk) setDraft('');
    setFlow({ at: 'reply', beat: 0 });
    setMessages((current) => [...current, { id: uid(), role: 'user', text: message }]);
    setStage('understanding');

    // The reply appears as one message that fills in while it streams, then is replaced by the final reply.
    const id = uid();
    const withoutDraft = (current: UiMessage[]) => current.filter((item) => item.id !== id);
    const patchDraft = (change: (item: AssistantMessage) => AssistantMessage) =>
      setMessages((current) => {
        const index = current.findIndex((item) => item.id === id);
        if (index < 0) {
          const empty: AssistantMessage = {
            id,
            role: 'assistant',
            reply: { acknowledge: '', connection: '', step: '' },
            verses: [],
            crisis: null,
            language: 'en',
            status: 'answered',
            streaming: true,
          };
          return [...current, change(empty)];
        }
        const item = current[index];
        if (item.role !== 'assistant') return current;
        const next = [...current];
        next[index] = change(item);
        return next;
      });
    const onEvent = (event: StreamEvent) => {
      if (event.type === 'stage') setStage(event.stage);
      else if (event.type === 'verses') {
        if (event.verses.length > 0 || event.crisis) patchDraft((item) => ({ ...item, verses: event.verses, crisis: event.crisis }));
      } else if (event.type === 'delta') {
        patchDraft((item) => ({ ...item, reply: { ...item.reply, [event.field]: (item.reply[event.field] ?? '') + event.text } }));
      } else if (event.type === 'reset') {
        patchDraft((item) => ({ ...item, reply: { acknowledge: '', connection: '', step: '', question: '' } }));
      }
    };

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message, stream: true, ...companion.person(readPref(NAME_KEY) ?? '') }),
      });
      const streamed = response.ok && response.body && (response.headers.get('content-type') ?? '').includes('ndjson');
      const data = streamed ? await readStream(response.body!, onEvent) : ((await response.json()) as ChatResponse);
      if (!data || !response.ok || data.status === 'unavailable') {
        const crisis = data?.crisis ?? null;
        setMessages((current) => [...withoutDraft(current), { id: uid(), role: 'error', text: data?.error || data?.guidance || UNAVAILABLE_TEXT, crisis }]);
        return { speak: crisis ? `${crisis.message} ${UNAVAILABLE_SPOKEN}` : UNAVAILABLE_SPOKEN, pause: true };
      }
      const reply = data.reply ?? { acknowledge: data.guidance, connection: '', step: '' };
      const crisis = data.crisis ?? null;
      const language = data.language ?? 'en';
      const status = data.status === 'no_strong_match' || data.status === 'conversation' ? data.status : 'answered';
      const replyId = data.replyId;
      setMessages((current) => [...withoutDraft(current), { id, role: 'assistant', reply, verses: data.verses ?? [], crisis, language, status, replyId }]);
      companion.setLanguage(language);
      if (Array.isArray(data.remember) && companion.remember(data.remember) > 0) flash('Krishna will remember this');
      const spoken = speakableText(reply, crisis?.message, language);
      const remoteUrl = ttsUrl(replyId);
      if (!fromTalk && autoPlayRef.current && voice.supported) void withFace(() => voice.speak(id, spoken, undefined, language, remoteUrl));
      return { speak: spoken, pause: Boolean(crisis), language, remoteUrl };
    } catch {
      setMessages((current) => [...withoutDraft(current), { id: uid(), role: 'error', text: UNAVAILABLE_TEXT, crisis: null }]);
      return { speak: UNAVAILABLE_SPOKEN, pause: true };
    } finally {
      setPending(null);
    }
  }

  /** "Understand a verse": shows the stored verse for a typed reference. No model is involved. */
  async function understandVerse(text: string) {
    const match = /(\d{1,2})\D+(\d{1,3})/.exec(text);
    if (!match) {
      setFormError('Please type the chapter and verse, like 2.47.');
      return;
    }
    const [, chapter, number] = match;
    setFormError('');
    setPending('send');
    try {
      const response = await fetch(`/api/verse?chapter=${chapter}&verse=${number}`);
      if (!response.ok) {
        setFormError(`I could not find Chapter ${chapter}, Verse ${number}. Please check the numbers.`);
        return;
      }
      const { verse } = (await response.json()) as { verse: DisplayVerse };
      setDraft('');
      setMessages((current) => [
        ...current,
        { id: uid(), role: 'user', text: `Chapter ${chapter}, Verse ${number}` },
        {
          id: uid(),
          role: 'assistant',
          reply: { acknowledge: `Let us sit with Chapter ${chapter}, Verse ${number}.`, connection: verse.summary ? (verse.englishTranslation ?? '') : '', step: '' },
          verses: [verse],
          crisis: null,
          language: 'en',
          status: 'conversation',
        },
      ]);
      setFlow({ at: 'reply', beat: 0 });
      const meaning = verse.summary ?? verse.englishTranslation ?? '';
      speakLine(`verse-${chapter}.${number}`, `/api/tts?verse=${chapter}.${number}`, `Chapter ${chapter}, verse ${number}. ${meaning}`);
    } catch {
      setFormError('The verse could not be opened. Please try again.');
    } finally {
      setPending(null);
    }
  }

  const talk = useTalkMode(voice, dictation, (text) => sendMessage(text, true));
  const talking = talk.state.mode !== 'off';
  const canTalk = voice.supported && dictation.supported;

  /**
   * Wakes Krishna's live face on the stage and then speaks. If the face is not ready within
   * a few seconds the line is spoken by voice alone, and the face joins for the next one.
   */
  async function withFace(speakNow: () => void) {
    if (!avatarOn) {
      speakNow();
      return;
    }
    await Promise.race([avatarEngine().connect(), new Promise((resolve) => window.setTimeout(resolve, FACE_WAIT_MS))]);
    speakNow();
  }

  /**
   * Krishna says one of his lines, if his voice is on and the browser allows sound.
   * `url` is a server-side line (never browser text); `text` is what the device voice reads if needed.
   * Returns false when nothing will be spoken, so the caller does not wait for it.
   */
  function speakLine(id: string, url: string, text: string, onDone?: () => void): boolean {
    if (!autoPlayRef.current || !voice.supported || !hasUserActivation()) return false;
    void withFace(() => voice.speak(id, text, onDone, 'en', url));
    return true;
  }

  function meetKrishna() {
    voice.unlock();
    void withFace(() => voice.speak('greeting', KRISHNA_GREETING, undefined, 'en', '/api/tts?greeting=1'));
  }

  // The live face closes a while after Krishna stops speaking, so no minutes are spent in silence.
  useEffect(() => {
    if (avatarState !== 'ready' || talking || voice.speakingId !== null) return;
    const timer = window.setTimeout(() => avatarEngine().disconnect(), FACE_IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [avatarState, talking, voice.speakingId]);

  async function startNewTopic() {
    if (pending) return;
    voice.stop();
    if (talking) talk.end();
    setPending('reset');
    setFormError('');
    try {
      await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, reset: true }),
      });
    } catch {
      setFormError('The conversation could not be cleared on the server. The screen was cleared.');
    } finally {
      setMessages([]);
      writeSession(THREAD_KEY, null);
      dropPref(THREAD_KEY);
      setDraft('');
      setPending(null);
      setFlow({ at: 'choices' });
    }
  }

  function toggleMic() {
    if (dictation.listening) {
      dictation.stop();
      return;
    }
    voice.stop();
    setFormError('');
    void dictation.start(
      ({ text, error }) => {
        if (text) setDraft((current) => (current.trim() ? `${current.trimEnd()} ${text}` : text));
        else if (error === 'no-speech') setFormError('I did not hear anything. Tap the mic and try again.');
        else if (error) setFormError(micErrorMessage(error));
      },
      { autoStop: false },
    );
  }

  function startTalk() {
    setPanel('none');
    markEntered();
    voice.unlock();
    // Connects while Krishna listens, so the face is ready by the time he answers.
    if (avatarOn) void avatarEngine().connect();
    talk.begin();
  }

  /** Stops anything live when the person leaves the conversation page. */
  function leaveStage() {
    if (talking) talk.end();
    voice.stop();
    avatarEngine().disconnect();
  }

  /** Opens the face as early as possible, inside a tap, so it is ready for the first line. */
  function wakeFace() {
    voice.unlock();
    if (avatarOn && autoPlayRef.current) void avatarEngine().connect();
  }

  function changeNatural(value: boolean) {
    setNaturalPref(value);
    writePref(NATURAL_KEY, value ? '1' : '0');
    voice.stop();
  }

  function changeAvatar(value: boolean) {
    setAvatarPref(value);
    writePref(AVATAR_KEY, value ? '1' : '0');
    if (!value) avatarEngine().disconnect();
  }

  function changeAutoPlay(value: boolean) {
    setAutoPlay(value);
    writePref(AUTOPLAY_KEY, value ? '1' : '0');
    if (!value) voice.stop();
  }

  function changeMicLang(value: string) {
    setMicLang(value);
    writePref(MIC_LANG_KEY, value);
  }

  return {
    companion,
    changeMemoryOn,
    flow,
    setFlow,
    finishEntrance,
    markEntered,
    panel,
    setPanel,
    name,
    setName,
    notice,
    flash,
    actionsFor,
    messages,
    draft,
    setDraft,
    pending,
    stage,
    formError,
    setFormError,
    sendMessage,
    understandVerse,
    startNewTopic,
    autoPlay,
    changeAutoPlay,
    micLang,
    changeMicLang,
    service,
    naturalPref,
    changeNatural,
    avatarPref,
    changeAvatar,
    naturalVoice,
    avatarOn,
    voice,
    avatarState,
    recorder,
    dictation,
    sttDown,
    talk,
    talking,
    canTalk,
    meetKrishna,
    withFace,
    speakLine,
    wakeFace,
    ttsUrl,
    toggleMic,
    startTalk,
    leaveStage,
  };
}

export type Conversation = ReturnType<typeof useConversationState>;

const ConversationContext = createContext<Conversation | null>(null);

export function ConversationProvider({ children }: { children: ReactNode }) {
  const value = useConversationState();
  return <ConversationContext.Provider value={value}>{children}</ConversationContext.Provider>;
}

export function useConversation(): Conversation {
  const value = useContext(ConversationContext);
  if (!value) throw new Error('useConversation must be used inside ConversationProvider');
  return value;
}
