'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { DisplayVerse } from '@/lib/corpus';
import { speakableText } from '@/lib/speech';
import {
  CloseIcon,
  CompassIcon,
  DiyaIcon,
  FlameIcon,
  KrishnaMark,
  MicIcon,
  NewChatIcon,
  PeacockFeather,
  RainIcon,
  SendIcon,
  SlidersIcon,
  StopIcon,
  VolumeIcon,
} from './icons';
import { useSavedVerses, verseRef } from './saved';
import { shareVerse } from './share-card';
import { clearTalkDraft, readTalkDraft } from './talk-handoff';
import { IconButton, VerseCard, type VerseActions } from './verse-card';
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
} from './use-speech';

type Reply = { acknowledge: string; connection: string; step: string };

type Crisis = { message: string; helplines: { name: string; number: string; note: string }[] } | null;

type Stage = 'understanding' | 'searching' | 'choosing' | 'writing';

/** Lines of the streamed /api/chat response; "done" carries the same body as the plain JSON reply. */
type StreamEvent =
  | { type: 'stage'; stage: Stage }
  | { type: 'verses'; verses: DisplayVerse[]; crisis: Crisis }
  | { type: 'delta'; field: keyof Reply; text: string }
  | { type: 'reset' }
  | ({ type: 'done' } & ChatResponse);

const STAGE_LABELS: Record<Stage, string> = {
  understanding: 'Krishna is listening',
  searching: 'Finding a verse for you',
  choosing: 'Choosing the verse',
  writing: 'Krishna is writing',
};

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

type ChatStatus = 'answered' | 'no_strong_match' | 'conversation' | 'unavailable';

type ChatResponse = {
  status: ChatStatus;
  guidance: string;
  reply?: Reply;
  verses: DisplayVerse[];
  crisis?: Crisis;
  language?: string;
  replyId?: string;
  error?: string;
};

type UiMessage =
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

const STARTERS = [
  { icon: RainIcon, title: 'Fear', text: 'I am afraid and I do not know what to do' },
  { icon: CompassIcon, title: 'Duty', text: 'I know my duty but I do not want to do it' },
  { icon: DiyaIcon, title: 'Grief', text: 'I lost someone I love and the grief is heavy' },
  { icon: FlameIcon, title: 'A quarrel', text: 'I am in a quarrel and I cannot let it go' },
];

const UNAVAILABLE_TEXT = 'The reply could not be completed. Please try again.';
const UNAVAILABLE_SPOKEN = 'Let us pause for a moment. Please try again in a little while.';
const AUTOPLAY_KEY = 'gita.autoplay';
const NATURAL_KEY = 'gita.naturalVoice';
const MIC_LANG_KEY = 'gita.micLang';
const MIC_LANGS = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'hi-IN', label: 'Hindi' },
  { code: 'ta-IN', label: 'Tamil' },
];

const TALK_LABELS: Record<string, string> = {
  listening: 'I am listening',
  thinking: 'Reflecting on your words',
  speaking: 'Krishna is speaking',
  paused: 'Paused',
};

function CrisisCard({ crisis }: { crisis: NonNullable<Crisis> }) {
  return (
    <aside className="crisis" role="alert">
      <p className="crisis-message">{crisis.message}</p>
      <ul className="crisis-lines">
        {crisis.helplines.map((line) => (
          <li key={line.number}>
            <a href={`tel:${line.number}`} className="crisis-call">
              <span className="crisis-name">{line.name}</span>
              <span className="crisis-number">{line.number}</span>
            </a>
            <span className="crisis-note">{line.note}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function ThinkingLine({ label }: { label: string }) {
  return (
    <p className="thinking" role="status">
      {label}
      <span className="thinking-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </p>
  );
}

function MicLevel({ level }: { level: number }) {
  return (
    <span className="mic-level" aria-hidden="true">
      {[0.2, 0.45, 0.7, 1, 0.7, 0.45, 0.2].map((weight, index) => (
        <span key={index} style={{ transform: `scaleY(${Math.max(0.15, Math.min(1, level * 1.6 * weight + 0.12))})` }} />
      ))}
    </span>
  );
}

function voiceSortKey(voice: SpeechSynthesisVoice): string {
  const lang = voice.lang.replace('_', '-').toLowerCase();
  return `${lang === 'en-in' ? 0 : lang.startsWith('en') ? 1 : 2}${voice.name}`;
}

export function ChatScreen({ daily, withToday = false }: { daily: DisplayVerse | null; withToday?: boolean }) {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sharingRef, setSharingRef] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const savedVerses = useSavedVerses();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

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

  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<'send' | 'reset' | null>(null);
  const [stage, setStage] = useState<Stage>('understanding');
  const [formError, setFormError] = useState('');
  const [autoPlay, setAutoPlay] = useState(false);
  const [micLang, setMicLang] = useState('en-IN');
  const [service, setService] = useState({ tts: false, stt: false });
  const [naturalPref, setNaturalPref] = useState(true);
  const [sttDown, setSttDown] = useState(false);

  const naturalVoice = service.tts && naturalPref;
  const voice = useKrishnaVoice(naturalVoice);
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

  useEffect(() => {
    if (!withToday) return;
    const waiting = readTalkDraft();
    if (waiting) setDraft(waiting);
    const timer = window.setTimeout(() => {
      if (waiting) textareaRef.current?.focus();
      clearTalkDraft();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [withToday]);

  useEffect(() => {
    setAutoPlay(readPref(AUTOPLAY_KEY) === '1');
    setNaturalPref(readPref(NATURAL_KEY) !== '0');
    const saved = readPref(MIC_LANG_KEY);
    if (saved && MIC_LANGS.some((item) => item.code === saved)) setMicLang(saved);
    fetch('/api/voice')
      .then((response) => (response.ok ? response.json() : { tts: false, stt: false }))
      .then((data: { tts?: boolean; stt?: boolean }) => setService({ tts: Boolean(data.tts), stt: Boolean(data.stt) }))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (messages.length > 0 || pending === 'send') endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, pending]);

  // Follow a reply while it streams in, unless the person has scrolled up to read something else.
  const followRef = useRef(true);
  useEffect(() => {
    const onScroll = () => {
      followRef.current = document.documentElement.scrollHeight - window.innerHeight - window.scrollY < 160;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const last = messages[messages.length - 1];
  const streamSize =
    last?.role === 'assistant' && last.streaming
      ? last.reply.acknowledge.length + last.reply.connection.length + last.reply.step.length + last.verses.length * 1000 + (last.crisis ? 1 : 0)
      : 0;
  useEffect(() => {
    if (streamSize > 0 && followRef.current) endRef.current?.scrollIntoView({ block: 'end' });
  }, [streamSize]);

  useEffect(() => {
    const box = textareaRef.current;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, 168)}px`;
  }, [draft]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen]);

  function ttsUrl(replyId?: string): string | undefined {
    return replyId
      ? `/api/tts?sessionId=${encodeURIComponent(sessionId)}&replyId=${encodeURIComponent(replyId)}`
      : undefined;
  }

  async function sendMessage(text: string, fromTalk = false): Promise<TalkTurn> {
    const message = text.trim();
    if (!message) return { speak: '', pause: true };
    setFormError('');
    setPending('send');
    clearTalkDraft();
    if (!fromTalk) setDraft('');
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text: message }]);
    setStage('understanding');

    // The reply appears as one message that fills in while it streams, then is replaced by the final reply.
    const id = crypto.randomUUID();
    const withoutDraft = (current: UiMessage[]) => current.filter((item) => item.id !== id);
    const patchDraft = (change: (item: Extract<UiMessage, { role: 'assistant' }>) => Extract<UiMessage, { role: 'assistant' }>) =>
      setMessages((current) => {
        const index = current.findIndex((item) => item.id === id);
        if (index < 0) {
          const empty = {
            id,
            role: 'assistant' as const,
            reply: { acknowledge: '', connection: '', step: '' },
            verses: [],
            crisis: null,
            language: 'en',
            status: 'answered' as const,
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
        patchDraft((item) => ({ ...item, reply: { ...item.reply, [event.field]: item.reply[event.field] + event.text } }));
      } else if (event.type === 'reset') {
        patchDraft((item) => ({ ...item, reply: { acknowledge: '', connection: '', step: '' } }));
      }
    };

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message, stream: true }),
      });
      const streamed = response.ok && response.body && (response.headers.get('content-type') ?? '').includes('ndjson');
      const data = streamed ? await readStream(response.body!, onEvent) : ((await response.json()) as ChatResponse);
      if (!data || !response.ok || data.status === 'unavailable') {
        const crisis = data?.crisis ?? null;
        setMessages((current) => [
          ...withoutDraft(current),
          { id: crypto.randomUUID(), role: 'error', text: data?.error || data?.guidance || UNAVAILABLE_TEXT, crisis },
        ]);
        return { speak: crisis ? `${crisis.message} ${UNAVAILABLE_SPOKEN}` : UNAVAILABLE_SPOKEN, pause: true };
      }
      const reply = data.reply ?? { acknowledge: data.guidance, connection: '', step: '' };
      const crisis = data.crisis ?? null;
      const language = data.language ?? 'en';
      const status = data.status === 'no_strong_match' || data.status === 'conversation' ? data.status : 'answered';
      const replyId = data.replyId;
      setMessages((current) => [
        ...withoutDraft(current),
        { id, role: 'assistant', reply, verses: data.verses ?? [], crisis, language, status, replyId },
      ]);
      const spoken = speakableText(reply, crisis?.message, language);
      const remoteUrl = ttsUrl(replyId);
      if (!fromTalk && autoPlayRef.current && voice.supported) voice.speak(id, spoken, undefined, language, remoteUrl);
      return { speak: spoken, pause: Boolean(crisis), language, remoteUrl };
    } catch {
      setMessages((current) => [
        ...withoutDraft(current),
        { id: crypto.randomUUID(), role: 'error', text: UNAVAILABLE_TEXT, crisis: null },
      ]);
      return { speak: UNAVAILABLE_SPOKEN, pause: true };
    } finally {
      setPending(null);
    }
  }

  const talk = useTalkMode(voice, dictation, (text) => sendMessage(text, true));
  const talking = talk.state.mode !== 'off';
  const canTalk = voice.supported && dictation.supported;

  useEffect(() => {
    if (!talking) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        talk.end();
      } else if (event.key === ' ' && talk.state.mode === 'speaking') {
        const target = event.target as HTMLElement | null;
        if (target && ['TEXTAREA', 'INPUT', 'SELECT', 'BUTTON'].includes(target.tagName)) return;
        event.preventDefault();
        talk.interrupt();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [talking, talk]);

  async function startNewTopic() {
    if (pending) return;
    voice.stop();
    if (talking) talk.end();
    setPending('reset');
    setFormError('');
    clearTalkDraft();
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
      setDraft('');
      setPending(null);
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
    setSettingsOpen(false);
    voice.unlock();
    talk.begin();
  }

  function pickStarter(text: string) {
    setDraft(text);
    textareaRef.current?.focus();
  }

  function changeNatural(value: boolean) {
    setNaturalPref(value);
    writePref(NATURAL_KEY, value ? '1' : '0');
    voice.stop();
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

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dictation.listening) dictation.cancel();
    if (pending) return;
    if (autoPlay) voice.unlock();
    void sendMessage(draft);
  }

  const voiceOptions = [...voice.voices]
    .filter((item) => /^(en|hi)/i.test(item.lang))
    .sort((a, b) => voiceSortKey(a).localeCompare(voiceSortKey(b)));

  const lastReply = [...messages].reverse().find((item) => item.role === 'assistant');
  const canSend = pending === null && draft.trim().length > 0;

  return (
    <>
      {settingsOpen ? (
        <>
          <button type="button" className="sheet-backdrop" aria-label="Close voice settings" onClick={() => setSettingsOpen(false)} />
          <section className="sheet" role="dialog" aria-label="Voice settings">
            <header className="sheet-head">
              <h2>Voice</h2>
              <IconButton label="Close" onClick={() => setSettingsOpen(false)} className="icon-btn-sm">
                <CloseIcon />
              </IconButton>
            </header>
            {service.tts || service.stt ? (
              <label className="switch-row">
                <span>
                  <span className="switch-title">Natural voice</span>
                  <span className="switch-sub">Krishna speaks with a lifelike voice</span>
                </span>
                <input type="checkbox" className="switch" checked={naturalPref} onChange={(event) => changeNatural(event.target.checked)} />
              </label>
            ) : null}
            {voice.supported ? (
              <label className="switch-row">
                <span>
                  <span className="switch-title">Speak replies aloud</span>
                  <span className="switch-sub">Every new reply is read out</span>
                </span>
                <input type="checkbox" className="switch" checked={autoPlay} onChange={(event) => changeAutoPlay(event.target.checked)} />
              </label>
            ) : null}
            {naturalVoice && voice.lastEngine === 'device' ? (
              <p className="sheet-note">The natural voice was unavailable, so your device voice spoke instead.</p>
            ) : null}
            {dictation.supported ? (
              <label className="field">
                <span className="field-label">I will speak in</span>
                <select value={micLang} onChange={(event) => changeMicLang(event.target.value)}>
                  {MIC_LANGS.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="sheet-note">Voice input works in Chrome, Edge and Safari.</p>
            )}
            {voice.supported && voiceOptions.length > 0 ? (
              <label className="field">
                <span className="field-label">{naturalVoice ? 'Backup device voice' : 'Device voice'}</span>
                <select value={voice.voice?.name ?? ''} onChange={(event) => voice.setVoice(event.target.value)}>
                  {voiceOptions.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {sttDown ? <p className="sheet-note">Natural voice input is unavailable right now; your browser microphone is used instead.</p> : null}
            <p className="sheet-foot">
              {naturalVoice || recorder.supported
                ? 'Your voice and Krishna’s replies are processed by ElevenLabs.'
                : 'Voices come from your device. In Chrome, speech is turned into text by Google.'}
            </p>
          </section>
        </>
      ) : null}

      <main className="content">
        <div className="talk-tools">
          {voice.supported || dictation.supported ? (
            <IconButton label="Voice settings" pressed={settingsOpen} onClick={() => setSettingsOpen((open) => !open)}>
              <SlidersIcon />
            </IconButton>
          ) : null}
          <IconButton
            label="New conversation"
            disabled={pending !== null || messages.length === 0}
            onClick={() => void startNewTopic()}
          >
            <NewChatIcon />
          </IconButton>
        </div>
        {messages.length === 0 ? (
          <div className="home">
            <section className="hero hero-quiet">
              <p className="hero-kicker">Talk</p>
              <h1 className="hero-title">{withToday ? 'What is heavy today?' : 'What is on your heart?'}</h1>
              <p className="hero-sub">
                Say it in your own words. Krishna answers with a verse from the Bhagavad Gita.
              </p>
              {canTalk ? (
                <button type="button" className="btn btn-primary btn-lg" onClick={startTalk}>
                  <MicIcon />
                  Talk to Krishna
                </button>
              ) : null}
            </section>

            {withToday && daily ? (
              <section className="daily" aria-labelledby="daily-title">
                <h2 id="daily-title" className="section-label">
                  Today’s verse
                </h2>
                <VerseCard verse={daily} label="Today’s verse" actions={actionsFor(daily)} />
              </section>
            ) : null}

            <section className="starters" aria-labelledby="starters-title">
              <h2 id="starters-title" className="section-label">
                Or begin with
              </h2>
              <div className="starter-grid">
                {STARTERS.map((starter) => (
                  <button key={starter.title} type="button" className="starter" onClick={() => pickStarter(starter.text)}>
                    <span className="starter-icon">
                      <starter.icon />
                    </span>
                    <span className="starter-text">
                      <span className="starter-title">{starter.title}</span>
                      <span className="starter-sub">{starter.text}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : (
          <section className="thread" aria-live="polite" aria-label="Conversation">
            {messages.map((item) => {
              if (item.role === 'user') {
                return (
                  <div key={item.id} className="msg msg-user">
                    <p className="bubble-user">{item.text}</p>
                  </div>
                );
              }
              if (item.role === 'error') {
                return (
                  <article key={item.id} className="msg msg-krishna">
                    <KrishnaMark className="avatar" />
                    <div className="msg-body">
                      {item.crisis ? <CrisisCard crisis={item.crisis} /> : null}
                      <p className="msg-error" role="alert">
                        {item.text}
                      </p>
                    </div>
                  </article>
                );
              }
              const speaking = voice.speakingId === item.id;
              // While streaming, a cursor follows the last part that has text so far.
              const caretOn = !item.streaming
                ? null
                : item.reply.step
                  ? 'step'
                  : item.reply.connection
                    ? 'connection'
                    : item.reply.acknowledge
                      ? 'acknowledge'
                      : null;
              const caret = <span className="stream-caret" aria-hidden="true" />;
              return (
                <article
                  key={item.id}
                  className={`msg msg-krishna ${item.streaming ? 'is-streaming' : ''}`}
                  lang={item.language}
                  aria-busy={item.streaming || undefined}
                >
                  <KrishnaMark className="avatar" />
                  <div className="msg-body">
                    <div className="msg-head">
                      <span className="msg-name">Krishna</span>
                      {voice.supported && !talking && !item.streaming ? (
                        <button
                          type="button"
                          className={`listen ${speaking ? 'is-playing' : ''}`}
                          aria-pressed={speaking}
                          onClick={() =>
                            speaking
                              ? voice.stop()
                              : voice.speak(
                                  item.id,
                                  speakableText(item.reply, item.crisis?.message, item.language),
                                  undefined,
                                  item.language,
                                  ttsUrl(item.replyId),
                                )
                          }
                        >
                          {speaking ? <StopIcon width={16} height={16} /> : <VolumeIcon width={16} height={16} />}
                          {speaking ? 'Stop' : 'Listen'}
                        </button>
                      ) : null}
                    </div>
                    {item.crisis ? <CrisisCard crisis={item.crisis} /> : null}
                    {item.reply.acknowledge ? (
                      <p className="krishna-words">
                        {item.reply.acknowledge}
                        {caretOn === 'acknowledge' ? caret : null}
                      </p>
                    ) : null}
                    {item.verses.map((verse) => (
                      <VerseCard key={verseRef(verse)} verse={verse} actions={actionsFor(verse)} />
                    ))}
                    {item.reply.connection ? (
                      <p className="krishna-words">
                        {item.reply.connection}
                        {caretOn === 'connection' ? caret : null}
                      </p>
                    ) : null}
                    {item.reply.step ? (
                      <div className="practice">
                        <span className="practice-icon">
                          <DiyaIcon />
                        </span>
                        <div>
                          <p className="practice-label">Today’s practice</p>
                          <p className="practice-text">
                            {item.reply.step}
                            {caretOn === 'step' ? caret : null}
                          </p>
                        </div>
                      </div>
                    ) : null}
                    {item.streaming && !caretOn ? <ThinkingLine label={STAGE_LABELS[stage]} /> : null}
                  </div>
                </article>
              );
            })}
            {pending === 'send' && !talking && !(last?.role === 'assistant' && last.streaming) ? (
              <div className="msg msg-krishna">
                <KrishnaMark className="avatar" />
                <div className="msg-body">
                  <ThinkingLine label={STAGE_LABELS[stage]} />
                </div>
              </div>
            ) : null}
            <div ref={endRef} />
          </section>
        )}
      </main>

      {notice ? (
        <p className="toast" role="status">
          {notice}
        </p>
      ) : null}

      {!talking ? (
        <div className="dock">
          <form className="composer" onSubmit={onSubmit}>
            {dictation.listening || dictation.transcribing || formError ? (
              <div className="composer-status" role="status">
                {dictation.listening ? (
                  <>
                    <span className="rec-dot" aria-hidden="true" />
                    <span>{recorder.supported ? 'Listening… tap stop when you are done' : `Listening… ${dictation.interim}`}</span>
                    {recorder.supported ? <MicLevel level={dictation.level} /> : null}
                  </>
                ) : dictation.transcribing ? (
                  <span>Turning your words into text…</span>
                ) : (
                  <span className="composer-error">{formError}</span>
                )}
              </div>
            ) : null}
            <div className="composer-box">
              {dictation.supported ? (
                <button
                  type="button"
                  className={`composer-mic ${dictation.listening ? 'is-live' : ''}`}
                  aria-label={dictation.listening ? 'Stop recording' : 'Speak instead of typing'}
                  title={dictation.listening ? 'Stop recording' : 'Speak instead of typing'}
                  aria-pressed={dictation.listening}
                  onClick={toggleMic}
                  disabled={pending !== null || dictation.transcribing}
                >
                  {dictation.listening ? <StopIcon /> : <MicIcon />}
                </button>
              ) : null}
              <label htmlFor="message" className="sr-only">
                Share what is on your heart
              </label>
              <textarea
                ref={textareaRef}
                id="message"
                name="message"
                rows={1}
                maxLength={2000}
                value={draft}
                placeholder={withToday ? 'What is heavy today…' : 'Share what is on your heart…'}
                disabled={pending !== null}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    if (canSend) void sendMessage(draft);
                  }
                }}
              />
              <button type="submit" className="send" aria-label="Send" title="Send" disabled={!canSend}>
                <SendIcon />
              </button>
            </div>
            <p className="composer-note">
              An AI guide inspired by the Bhagavad Gita, not a substitute for professional help.
              {draft.length > 1500 ? ` ${draft.length}/2000` : ''}
            </p>
          </form>
        </div>
      ) : null}

      {talking ? (
        <div className="talk" role="dialog" aria-modal="true" aria-label="Talk to Krishna" data-mode={talk.state.mode}>
          <IconButton label="End conversation" onClick={talk.end} className="talk-close">
            <CloseIcon />
          </IconButton>
          <div className="talk-center">
            <div className="talk-orb" aria-hidden="true">
              <span className="talk-ring" />
              <span className="talk-ring talk-ring-2" />
              <PeacockFeather className="talk-feather" />
            </div>
            <p className="talk-status" aria-live="polite">
              {talk.state.mode === 'listening' && dictation.transcribing ? 'Understanding your words' : TALK_LABELS[talk.state.mode]}
            </p>
            {talk.state.mode === 'listening' && dictation.listening && recorder.supported ? <MicLevel level={dictation.level} /> : null}
            {talk.state.mode === 'listening' && dictation.interim ? <p className="talk-caption">{dictation.interim}</p> : null}
            {talk.state.mode === 'speaking' && lastReply?.role === 'assistant' && lastReply.reply.acknowledge ? (
              <p className="talk-caption">{lastReply.reply.acknowledge}</p>
            ) : null}
            {talk.state.mode === 'paused' && talk.state.note ? <p className="talk-caption">{talk.state.note}</p> : null}
          </div>
          <div className="talk-actions">
            {talk.state.mode === 'speaking' ? (
              <button type="button" className="btn btn-primary btn-lg" onClick={talk.interrupt}>
                Interrupt
              </button>
            ) : null}
            {talk.state.mode === 'paused' ? (
              <button type="button" className="btn btn-primary btn-lg" onClick={startTalk}>
                <MicIcon />
                Continue
              </button>
            ) : null}
            <button type="button" className="btn btn-ghost" onClick={talk.end}>
              End conversation
            </button>
            <p className="talk-hint">Space to interrupt · Esc to end</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
