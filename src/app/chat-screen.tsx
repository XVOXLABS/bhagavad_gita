'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { DisplayVerse } from '@/lib/corpus';
import { speakableText } from '@/lib/speech';
import {
  BackIcon,
  BookIcon,
  BookmarkIcon,
  ChevronIcon,
  CloseIcon,
  CompassIcon,
  DiyaIcon,
  FlameIcon,
  KrishnaMark,
  Lotus,
  MicIcon,
  NewChatIcon,
  PeacockFeather,
  RainIcon,
  SendIcon,
  ShareIcon,
  SlidersIcon,
  StopIcon,
  SunIcon,
  VolumeIcon,
} from './icons';
import { useSavedVerses, verseRef } from './saved';
import { shareVerse } from './share-card';
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

type VerseActions = {
  saved: boolean;
  sharing: boolean;
  onToggleSave: () => void;
  onShare: () => void;
};

type Reply = { acknowledge: string; connection: string; step: string };

type Crisis = { message: string; helplines: { name: string; number: string; note: string }[] } | null;

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
    }
  | { id: string; role: 'error'; text: string; crisis: Crisis };

const STARTERS = [
  { icon: BookIcon, title: 'Exams and results', text: 'I am anxious about my exams and results' },
  { icon: RainIcon, title: 'Grief and loss', text: 'I lost someone I love and the grief is heavy' },
  { icon: FlameIcon, title: 'Anger', text: 'I get angry quickly and regret it later' },
  { icon: CompassIcon, title: 'Purpose', text: 'I feel lost and do not know my purpose' },
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

function IconButton({
  label,
  onClick,
  pressed,
  disabled,
  badge,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  badge?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`icon-btn ${className ?? ''}`}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
      {badge ? <span className="icon-badge">{badge > 99 ? '99+' : badge}</span> : null}
    </button>
  );
}

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

function VerseCard({ verse, label, actions }: { verse: DisplayVerse; label?: string; actions?: VerseActions }) {
  const extra = verse.transliteration || verse.hindiMeaning || verse.wordMeanings;
  const showTranslationInline = !verse.summary && verse.englishTranslation;
  return (
    <figure className="verse-card" lang="en">
      <header className="verse-head">
        <div>
          <p className="verse-kicker">{label ?? 'Bhagavad Gita'}</p>
          <p className="verse-ref">
            Chapter {verse.chapter} · Verse {verse.verse}
            {verse.themes?.[0] ? <span className="verse-yoga"> · {verse.themes[0]}</span> : null}
          </p>
        </div>
        {actions ? (
          <div className="verse-tools">
            <IconButton
              label={actions.saved ? 'Remove from My Gita' : 'Save to My Gita'}
              pressed={actions.saved}
              onClick={actions.onToggleSave}
              className="icon-btn-sm"
            >
              <BookmarkIcon filled={actions.saved} />
            </IconButton>
            <IconButton
              label={actions.sharing ? 'Preparing image' : 'Share as image'}
              disabled={actions.sharing}
              onClick={actions.onShare}
              className="icon-btn-sm"
            >
              <ShareIcon />
            </IconButton>
          </div>
        ) : null}
      </header>

      <blockquote className="sanskrit" lang="sa">
        {verse.sanskrit.replace(/।।\s*\d+\.\d+\s*।।/g, '॥').replace(/\n\s*\n+/g, '\n')}
      </blockquote>

      <Lotus className="verse-lotus" />

      {verse.summary ? <p className="verse-meaning">{verse.summary}</p> : null}
      {showTranslationInline ? <p className="verse-meaning">{verse.englishTranslation}</p> : null}

      {(verse.englishTranslation && !showTranslationInline) || extra ? (
        <details className="verse-more">
          <summary>
            <span>Translation and word meanings</span>
            <ChevronIcon className="verse-more-chevron" />
          </summary>
          <div className="verse-more-body">
            {verse.englishTranslation && !showTranslationInline ? (
              <div>
                <h4>Translation</h4>
                <p>{verse.englishTranslation}</p>
              </div>
            ) : null}
            {verse.transliteration ? (
              <div>
                <h4>Transliteration</h4>
                <p>{verse.transliteration}</p>
              </div>
            ) : null}
            {verse.hindiMeaning ? (
              <div>
                <h4>Hindi</h4>
                <p lang="hi">{verse.hindiMeaning}</p>
              </div>
            ) : null}
            {verse.wordMeanings ? (
              <div>
                <h4>Word meanings</h4>
                <p>{verse.wordMeanings}</p>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </figure>
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

export function ChatScreen({ daily }: { daily: DisplayVerse | null }) {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [view, setView] = useState<'chat' | 'saved'>('chat');
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
    setView('chat');
    if (!fromTalk) setDraft('');
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text: message }]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message }),
      });
      const data = (await response.json()) as ChatResponse;
      if (!response.ok || data.status === 'unavailable') {
        const crisis = data.crisis ?? null;
        setMessages((current) => [
          ...current,
          { id: crypto.randomUUID(), role: 'error', text: data.error || data.guidance || UNAVAILABLE_TEXT, crisis },
        ]);
        return { speak: crisis ? `${crisis.message} ${UNAVAILABLE_SPOKEN}` : UNAVAILABLE_SPOKEN, pause: true };
      }
      const id = crypto.randomUUID();
      const reply = data.reply ?? { acknowledge: data.guidance, connection: '', step: '' };
      const crisis = data.crisis ?? null;
      const language = data.language ?? 'en';
      const status = data.status === 'no_strong_match' || data.status === 'conversation' ? data.status : 'answered';
      const replyId = data.replyId;
      setMessages((current) => [
        ...current,
        { id, role: 'assistant', reply, verses: data.verses ?? [], crisis, language, status, replyId },
      ]);
      const spoken = speakableText(reply, crisis?.message, language);
      const remoteUrl = ttsUrl(replyId);
      if (!fromTalk && autoPlayRef.current && voice.supported) voice.speak(id, spoken, undefined, language, remoteUrl);
      return { speak: spoken, pause: Boolean(crisis), language, remoteUrl };
    } catch {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'error', text: UNAVAILABLE_TEXT, crisis: null }]);
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
    setView('chat');
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
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <button type="button" className="brand" onClick={() => setView('chat')} aria-label="Speak with Krishna, home">
            <KrishnaMark className="brand-mark" />
            <span className="brand-text">
              <span className="brand-name">Speak with Krishna</span>
              <span className="brand-tag">Guidance from the Bhagavad Gita</span>
            </span>
          </button>
          <nav className="top-actions" aria-label="App">
            <IconButton
              label={view === 'saved' ? 'Back to conversation' : 'My Gita: saved verses'}
              pressed={view === 'saved'}
              badge={view === 'saved' ? 0 : savedVerses.saved.length}
              onClick={() => setView((current) => (current === 'saved' ? 'chat' : 'saved'))}
            >
              <BookmarkIcon filled={view === 'saved'} />
            </IconButton>
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
          </nav>
        </div>
      </header>

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
        {view === 'saved' ? (
          <section className="saved" aria-labelledby="saved-title">
            <div className="saved-head">
              <IconButton label="Back to conversation" onClick={() => setView('chat')}>
                <BackIcon />
              </IconButton>
              <div>
                <h1 id="saved-title" className="page-title">
                  My Gita
                </h1>
                <p className="page-sub">
                  {savedVerses.saved.length === 1 ? '1 verse' : `${savedVerses.saved.length} verses`} saved on this device
                </p>
              </div>
            </div>
            {savedVerses.saved.length === 0 ? (
              <div className="empty-state">
                <Lotus className="empty-lotus" />
                <h2>No verses saved yet</h2>
                <p>Tap the bookmark on any verse that speaks to you, and it will wait for you here.</p>
                <button type="button" className="btn btn-secondary" onClick={() => setView('chat')}>
                  Return to the conversation
                </button>
              </div>
            ) : (
              <div className="saved-list">
                {savedVerses.saved.map((verse) => (
                  <VerseCard key={verseRef(verse)} verse={verse} actions={actionsFor(verse)} />
                ))}
              </div>
            )}
          </section>
        ) : messages.length === 0 ? (
          <div className="home">
            <section className="hero">
              <div className="hero-emblem" aria-hidden="true">
                <span className="hero-halo" />
                <PeacockFeather className="hero-feather" />
              </div>
              <p className="hero-kicker">Jai Shri Krishna</p>
              <h1 className="hero-title">What weighs on your heart today?</h1>
              <p className="hero-sub">
                Share it in your own words. Krishna answers with a verse from the Bhagavad Gita and what it means for
                you.
              </p>
              {canTalk ? (
                <button type="button" className="btn btn-primary btn-lg" onClick={startTalk}>
                  <MicIcon />
                  Talk to Krishna
                </button>
              ) : null}
            </section>

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

            {daily ? (
              <section className="daily" aria-labelledby="daily-title">
                <h2 id="daily-title" className="section-label">
                  <SunIcon width={16} height={16} /> Verse of the day
                </h2>
                <VerseCard verse={daily} label="Today’s verse" actions={actionsFor(daily)} />
              </section>
            ) : null}
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
              return (
                <article key={item.id} className="msg msg-krishna" lang={item.language}>
                  <KrishnaMark className="avatar" />
                  <div className="msg-body">
                    <div className="msg-head">
                      <span className="msg-name">Krishna</span>
                      {voice.supported && !talking ? (
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
                    {item.reply.acknowledge ? <p className="krishna-words">{item.reply.acknowledge}</p> : null}
                    {item.verses.map((verse) => (
                      <VerseCard key={verseRef(verse)} verse={verse} actions={actionsFor(verse)} />
                    ))}
                    {item.reply.connection ? <p className="krishna-words">{item.reply.connection}</p> : null}
                    {item.reply.step ? (
                      <div className="practice">
                        <span className="practice-icon">
                          <DiyaIcon />
                        </span>
                        <div>
                          <p className="practice-label">Today’s practice</p>
                          <p className="practice-text">{item.reply.step}</p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
            {pending === 'send' && !talking ? (
              <div className="msg msg-krishna" role="status">
                <KrishnaMark className="avatar" />
                <div className="msg-body">
                  <p className="thinking">
                    Krishna is reflecting
                    <span className="thinking-dots" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </span>
                  </p>
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

      {view === 'chat' && !talking ? (
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
                placeholder="Share what is on your heart…"
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
    </div>
  );
}
