'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { speakableText } from '@/lib/speech';
import { themeLabel } from '@/lib/themes';
import { micErrorMessage, readPref, useDictation, useKrishnaVoice, useTalkMode, writePref, type TalkTurn } from './use-speech';

type DisplayVerse = {
  chapter: number;
  verse: number;
  sanskrit: string;
  transliteration: string | null;
  wordMeanings: string | null;
  englishTranslation: string | null;
  hindiMeaning: string | null;
  summary: string | null;
  themes: string[];
  verseThemes?: string[];
};

type Reply = { acknowledge: string; connection: string; step: string };

type Crisis = { message: string; helplines: { name: string; number: string; note: string }[] } | null;

type ChatStatus = 'answered' | 'no_strong_match' | 'unavailable';

type ChatResponse = {
  status: ChatStatus;
  guidance: string;
  reply?: Reply;
  verses: DisplayVerse[];
  crisis?: Crisis;
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
      status: 'answered' | 'no_strong_match';
    }
  | { id: string; role: 'error'; text: string; crisis: Crisis };

function CrisisCard({ crisis }: { crisis: NonNullable<Crisis> }) {
  return (
    <aside className="crisis" role="alert">
      <p>{crisis.message}</p>
      <ul>
        {crisis.helplines.map((line) => (
          <li key={line.number}>
            <a href={`tel:${line.number}`}>
              <strong>{line.name}</strong> {line.number}
            </a>
            <small>{line.note}</small>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function VerseCard({ verse }: { verse: DisplayVerse }) {
  const themes = (verse.verseThemes ?? []).filter((theme) => theme !== 'narrative');
  const more = verse.transliteration || verse.hindiMeaning || verse.wordMeanings;
  return (
    <figure className="verse">
      <figcaption>
        Chapter {verse.chapter}, Verse {verse.verse}
        {verse.themes?.[0] ? <> · {verse.themes[0]}</> : null}
      </figcaption>
      <p className="sanskrit" lang="sa">
        {verse.sanskrit}
      </p>
      {verse.englishTranslation ? (
        <p>
          <span>Translation</span>
          {verse.englishTranslation}
        </p>
      ) : null}
      {verse.summary ? (
        <p className="summary">
          <span>What it means</span>
          {verse.summary}
        </p>
      ) : null}
      {themes.length > 0 ? (
        <ul className="tags" aria-label="Themes">
          {themes.map((theme) => (
            <li key={theme}>{themeLabel(theme)}</li>
          ))}
        </ul>
      ) : null}
      {more ? (
        <details>
          <summary>Transliteration, Hindi and word meanings</summary>
          {verse.transliteration ? (
            <p>
              <span>Transliteration</span>
              {verse.transliteration}
            </p>
          ) : null}
          {verse.hindiMeaning ? (
            <p lang="hi">
              <span>Hindi</span>
              {verse.hindiMeaning}
            </p>
          ) : null}
          {verse.wordMeanings ? (
            <p>
              <span>Word meanings</span>
              {verse.wordMeanings}
            </p>
          ) : null}
        </details>
      ) : null}
    </figure>
  );
}

const UNAVAILABLE_TEXT = 'The reply could not be completed. Please try again.';
const UNAVAILABLE_SPOKEN = 'Let us pause for a moment. Please try again in a little while.';
const AUTOPLAY_KEY = 'gita.autoplay';
const MIC_LANG_KEY = 'gita.micLang';
const MIC_LANGS = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'hi-IN', label: 'Hindi' },
  { code: 'ta-IN', label: 'Tamil' },
];

const TALK_LABELS: Record<string, string> = {
  listening: 'Listening… speak when you are ready',
  thinking: 'Krishna is reflecting…',
  speaking: 'Krishna is speaking',
  paused: 'Paused',
};

function voiceSortKey(voice: SpeechSynthesisVoice): string {
  const lang = voice.lang.replace('_', '-').toLowerCase();
  return `${lang === 'en-in' ? 0 : lang.startsWith('en') ? 1 : 2}${voice.name}`;
}

export function ChatScreen() {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<'send' | 'reset' | null>(null);
  const [formError, setFormError] = useState('');
  const [autoPlay, setAutoPlay] = useState(false);
  const [micLang, setMicLang] = useState('en-IN');

  const voice = useKrishnaVoice();
  const dictation = useDictation(micLang);
  const autoPlayRef = useRef(autoPlay);
  autoPlayRef.current = autoPlay;

  useEffect(() => {
    setAutoPlay(readPref(AUTOPLAY_KEY) === '1');
    const saved = readPref(MIC_LANG_KEY);
    if (saved && MIC_LANGS.some((item) => item.code === saved)) setMicLang(saved);
  }, []);

  async function sendMessage(text: string, fromTalk = false): Promise<TalkTurn> {
    const message = text.trim();
    if (!message) return { speak: '', pause: true };
    setFormError('');
    setPending('send');
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
      setMessages((current) => [
        ...current,
        {
          id,
          role: 'assistant',
          reply,
          verses: data.verses ?? [],
          crisis,
          status: data.status === 'no_strong_match' ? 'no_strong_match' : 'answered',
        },
      ]);
      const spoken = speakableText(reply, crisis?.message);
      if (!fromTalk && autoPlayRef.current && voice.supported) voice.speak(id, spoken);
      return { speak: spoken, pause: Boolean(crisis) };
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
    dictation.start(({ text, error }) => {
      if (text) setDraft((current) => (current.trim() ? `${current.trimEnd()} ${text}` : text));
      else if (error === 'no-speech') setFormError('I did not hear anything. Tap the mic and try again.');
      else if (error) setFormError(micErrorMessage(error));
    });
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
    void sendMessage(draft);
  }

  const voiceOptions = [...voice.voices]
    .filter((item) => /^(en|hi)/i.test(item.lang))
    .sort((a, b) => voiceSortKey(a).localeCompare(voiceSortKey(b)));

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Bhagavad Gita</p>
          <h1>Speak with Krishna</h1>
        </div>
        <div className="top-actions">
          {canTalk && !talking ? (
            <button type="button" className="talk-button" onClick={talk.begin} disabled={pending !== null}>
              Talk to Krishna
            </button>
          ) : null}
          {voice.supported || dictation.supported ? (
            <details className="voice-settings">
              <summary>Voice</summary>
              <div className="voice-panel">
                {voice.supported ? (
                  <>
                    <label className="check">
                      <input type="checkbox" checked={autoPlay} onChange={(event) => changeAutoPlay(event.target.checked)} />
                      Speak replies aloud
                    </label>
                    {voiceOptions.length > 0 ? (
                      <label>
                        Krishna&apos;s voice
                        <select value={voice.voice?.name ?? ''} onChange={(event) => voice.setVoice(event.target.value)}>
                          {voiceOptions.map((item) => (
                            <option key={item.name} value={item.name}>
                              {item.name} ({item.lang})
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </>
                ) : null}
                {dictation.supported ? (
                  <label>
                    I will speak in
                    <select value={micLang} onChange={(event) => changeMicLang(event.target.value)}>
                      {MIC_LANGS.map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className="hint">Voice input works in Chrome, Edge, and Safari.</p>
                )}
                <p className="hint">
                  Voices come from your device. In Chrome, what you say is turned into text by Google&apos;s speech service.
                </p>
              </div>
            </details>
          ) : null}
          <button
            type="button"
            className="text-button"
            onClick={() => void startNewTopic()}
            disabled={pending !== null || messages.length === 0}
          >
            New topic
          </button>
        </div>
      </header>

      <section className="thread" aria-live="polite">
        {messages.length === 0 ? (
          <div className="empty">
            <p>Share what&apos;s on your mind.</p>
          </div>
        ) : (
          messages.map((item) => {
            if (item.role === 'user') {
              return (
                <article key={item.id} className="bubble user">
                  <p>{item.text}</p>
                </article>
              );
            }
            if (item.role === 'error') {
              return (
                <div key={item.id} className="reply">
                  {item.crisis ? <CrisisCard crisis={item.crisis} /> : null}
                  <article className="bubble error" role="alert">
                    <p>{item.text}</p>
                  </article>
                </div>
              );
            }
            const speaking = voice.speakingId === item.id;
            return (
              <article key={item.id} className="reply">
                {item.crisis ? <CrisisCard crisis={item.crisis} /> : null}
                {item.reply.acknowledge ? <p className="guidance">{item.reply.acknowledge}</p> : null}
                {item.verses.map((verse) => (
                  <VerseCard key={`${verse.chapter}.${verse.verse}`} verse={verse} />
                ))}
                {item.reply.connection ? (
                  <section className="connection">
                    <h2>How this speaks to you</h2>
                    <p>{item.reply.connection}</p>
                  </section>
                ) : null}
                {item.reply.step ? (
                  <section className="step">
                    <h2>One step for today</h2>
                    <p>{item.reply.step}</p>
                  </section>
                ) : null}
                {voice.supported && !talking ? (
                  <button
                    type="button"
                    className="listen-button"
                    aria-pressed={speaking}
                    onClick={() =>
                      speaking ? voice.stop() : voice.speak(item.id, speakableText(item.reply, item.crisis?.message))
                    }
                  >
                    {speaking ? 'Stop' : 'Listen'}
                  </button>
                ) : null}
              </article>
            );
          })
        )}
        {pending === 'send' && !talking ? <p className="pending">Reflecting…</p> : null}
      </section>

      {talking ? (
        <section className="talk-panel" data-mode={talk.state.mode} aria-live="polite">
          <div className="talk-orb" aria-hidden="true" />
          <p className="talk-status">{TALK_LABELS[talk.state.mode]}</p>
          {talk.state.mode === 'listening' && dictation.interim ? <p className="talk-interim">{dictation.interim}</p> : null}
          {talk.state.mode === 'paused' && talk.state.note ? <p className="talk-note">{talk.state.note}</p> : null}
          <div className="talk-actions">
            {talk.state.mode === 'speaking' ? (
              <button type="button" className="talk-primary" onClick={talk.interrupt}>
                Tap to interrupt
              </button>
            ) : null}
            {talk.state.mode === 'paused' ? (
              <button type="button" className="talk-primary" onClick={talk.begin}>
                Continue
              </button>
            ) : null}
            <button type="button" className="text-button" onClick={talk.end}>
              End conversation
            </button>
          </div>
          <p className="hint">Esc ends the conversation. Space interrupts Krishna.</p>
        </section>
      ) : (
        <form className="composer" onSubmit={onSubmit}>
          <label htmlFor="message">Share what&apos;s on your mind.</label>
          <textarea
            id="message"
            name="message"
            rows={3}
            maxLength={2000}
            value={draft}
            placeholder="A fear, a loss, a choice you are facing"
            disabled={pending !== null}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (!pending) void sendMessage(draft);
              }
            }}
          />
          {dictation.listening ? <p className="listening">Listening… {dictation.interim}</p> : null}
          {formError ? <p className="form-error">{formError}</p> : null}
          <div className="composer-row">
            <p>{draft.trim().length}/2000</p>
            <div className="composer-buttons">
              {dictation.supported ? (
                <button
                  type="button"
                  className="mic-button"
                  aria-pressed={dictation.listening}
                  aria-label={dictation.listening ? 'Stop listening' : 'Speak instead of typing'}
                  onClick={toggleMic}
                  disabled={pending !== null}
                >
                  {dictation.listening ? 'Stop' : 'Speak'}
                </button>
              ) : null}
              <button type="submit" disabled={pending !== null || draft.trim().length === 0}>
                Send
              </button>
            </div>
          </div>
        </form>
      )}
    </main>
  );
}
