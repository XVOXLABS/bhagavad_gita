'use client';

import { useEffect, useRef } from 'react';
import { isFamiliarity, isTone, type Familiarity, type Tone } from '@/lib/companion';
import { speakableText } from '@/lib/speech';
import { CloseIcon, DiyaIcon, StopIcon, VolumeIcon } from '../icons';
import { verseRef } from '../saved';
import { IconButton, VerseCard } from '../verse-card';
import { MIC_LANGS, useConversation } from './conversation';
import { CrisisCard, LotusMark } from './stage-parts';

export const TONE_CHOICES: { value: Tone; label: string }[] = [
  { value: 'gentle', label: 'Gently' },
  { value: 'direct', label: 'Plainly' },
  { value: 'playful', label: 'Playfully' },
];

export const FAMILIARITY_CHOICES: { value: Familiarity; label: string }[] = [
  { value: 'new', label: 'New to it' },
  { value: 'some', label: 'I know a little' },
  { value: 'deep', label: 'I have studied it' },
];

function voiceSortKey(voice: SpeechSynthesisVoice): string {
  const lang = voice.lang.replace('_', '-').toLowerCase();
  return `${lang === 'en-in' ? 0 : lang.startsWith('en') ? 1 : 2}${voice.name}`;
}

/** Keeps keyboard focus inside an open panel and closes it on Escape. */
function usePanelFocus(onClose: () => void) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button, a, input, select')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
    // The panel takes focus once, when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}

export function SettingsPanel() {
  const c = useConversation();
  const close = () => c.setPanel('none');
  const ref = usePanelFocus(close);
  const { voice, dictation, service } = c;
  const voiceOptions = [...voice.voices].filter((item) => /^(en|hi)/i.test(item.lang)).sort((a, b) => voiceSortKey(a).localeCompare(voiceSortKey(b)));

  return (
    <>
      <button type="button" className="sheet-backdrop" aria-label="Close settings" onClick={close} />
      <section ref={ref} className="stage-drawer" role="dialog" aria-modal="true" aria-label="Settings">
        <header className="sheet-head">
          <h2>Settings</h2>
          <IconButton label="Close" onClick={close} className="icon-btn-sm">
            <CloseIcon />
          </IconButton>
        </header>
        <label className="field">
          <span className="field-label">Krishna calls you</span>
          <input className="stage-input" value={c.name} maxLength={40} placeholder="Your name" onChange={(event) => c.setName(event.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Krishna speaks with you</span>
          <select value={c.companion.tone} onChange={(event) => isTone(event.target.value) && c.companion.setTone(event.target.value)}>
            {TONE_CHOICES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">How well you know the Gita</span>
          <select value={c.companion.familiarity} onChange={(event) => isFamiliarity(event.target.value) && c.companion.setFamiliarity(event.target.value)}>
            {FAMILIARITY_CHOICES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {service.tts || service.stt ? (
          <label className="switch-row">
            <span>
              <span className="switch-title">Natural voice</span>
              <span className="switch-sub">Krishna speaks with a lifelike voice</span>
            </span>
            <input type="checkbox" className="switch" checked={c.naturalPref} onChange={(event) => c.changeNatural(event.target.checked)} />
          </label>
        ) : null}
        {service.avatar && c.naturalVoice ? (
          <label className="switch-row">
            <span>
              <span className="switch-title">Show Krishna’s live face</span>
              <span className="switch-sub">His lips move with his words when he speaks</span>
            </span>
            <input type="checkbox" className="switch" checked={c.avatarPref} onChange={(event) => c.changeAvatar(event.target.checked)} />
          </label>
        ) : null}
        {voice.supported ? (
          <label className="switch-row">
            <span>
              <span className="switch-title">Krishna speaks aloud</span>
              <span className="switch-sub">His welcome, questions and every reply</span>
            </span>
            <input type="checkbox" className="switch" checked={c.autoPlay} onChange={(event) => c.changeAutoPlay(event.target.checked)} />
          </label>
        ) : null}
        {c.naturalVoice && voice.lastEngine === 'device' ? <p className="sheet-note">The natural voice was unavailable, so your device voice spoke instead.</p> : null}
        {dictation.supported ? (
          <label className="field">
            <span className="field-label">I will speak in</span>
            <select value={c.micLang} onChange={(event) => c.changeMicLang(event.target.value)}>
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
            <span className="field-label">{c.naturalVoice ? 'Backup device voice' : 'Device voice'}</span>
            <select value={voice.voice?.name ?? ''} onChange={(event) => voice.setVoice(event.target.value)}>
              {voiceOptions.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {c.sttDown ? <p className="sheet-note">Natural voice input is unavailable right now; your browser microphone is used instead.</p> : null}
        <p className="sheet-foot">
          {c.naturalVoice || c.recorder.supported
            ? c.avatarOn
              ? 'Your voice and Krishna’s replies are processed by ElevenLabs. Krishna’s video is rendered by Anam.'
              : 'Your voice and Krishna’s replies are processed by ElevenLabs.'
            : 'Voices come from your device. In Chrome, speech is turned into text by Google.'}
        </p>
      </section>
    </>
  );
}

function memoryDate(at: string): string {
  const date = new Date(`${at}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** What Krishna remembers about the person. They can see every line, remove any of it, or turn it off. */
export function MemoryPanel() {
  const c = useConversation();
  const close = () => c.setPanel('none');
  const ref = usePanelFocus(close);
  const { memories, memoryOn, forget, forgetAll } = c.companion;

  return (
    <>
      <button type="button" className="sheet-backdrop" aria-label="Close" onClick={close} />
      <section ref={ref} className="stage-drawer" role="dialog" aria-modal="true" aria-label="What Krishna remembers">
        <header className="sheet-head">
          <h2>What Krishna remembers</h2>
          <IconButton label="Close" onClick={close} className="icon-btn-sm">
            <CloseIcon />
          </IconButton>
        </header>
        <label className="switch-row">
          <span>
            <span className="switch-title">Remember what I share</span>
            <span className="switch-sub">Krishna recalls it the next time you talk</span>
          </span>
          <input type="checkbox" className="switch" checked={memoryOn} onChange={(event) => c.changeMemoryOn(event.target.checked)} />
        </label>
        {memories.length === 0 ? (
          <p className="stage-drawer-empty">
            {memoryOn ? 'Nothing yet. When you tell Krishna about your life, the things worth recalling will appear here.' : 'Remembering is off. Each conversation starts fresh.'}
          </p>
        ) : (
          <>
            {memoryOn ? null : <p className="sheet-note">Remembering is off, so these are not used. Turn it on to use them again, or remove them.</p>}
            <ul className="memory-list">
              {[...memories].reverse().map((item) => (
                <li key={item.id} className="memory-item">
                  <span className="memory-text">
                    {item.text}
                    <span className="memory-date">{memoryDate(item.at)}</span>
                  </span>
                  <IconButton label={`Forget: ${item.text}`} onClick={() => forget(item.id)} className="icon-btn-sm">
                    <CloseIcon />
                  </IconButton>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="stage-pill"
              onClick={() => {
                forgetAll();
                c.flash('Krishna has forgotten everything');
              }}
            >
              Forget everything
            </button>
          </>
        )}
        <p className="sheet-foot">
          Kept on this device only, as short notes of what you said. They are sent with your messages so Krishna can recall them, and are not stored on the server.
        </p>
      </section>
    </>
  );
}

/** The whole conversation so far, as text. */
export function TranscriptPanel() {
  const c = useConversation();
  const close = () => c.setPanel('none');
  const ref = usePanelFocus(close);
  const { voice } = c;

  return (
    <>
      <button type="button" className="sheet-backdrop" aria-label="Close conversation" onClick={close} />
      <section ref={ref} className="stage-drawer stage-drawer-wide" role="dialog" aria-modal="true" aria-label="Our conversation">
        <header className="sheet-head">
          <h2>Our conversation</h2>
          <IconButton label="Close" onClick={close} className="icon-btn-sm">
            <CloseIcon />
          </IconButton>
        </header>
        {c.messages.length === 0 ? <p className="stage-drawer-empty">Nothing has been said yet.</p> : null}
        <div className="thread">
          {c.messages.map((item) => {
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
                <LotusMark className="stage-thread-mark" />
                <div className="msg-body">
                  <div className="msg-head">
                    <span className="msg-name">Krishna</span>
                    {voice.supported && !c.talking && !item.streaming ? (
                      <button
                        type="button"
                        className={`listen ${speaking ? 'is-playing' : ''}`}
                        aria-pressed={speaking}
                        onClick={() => {
                          if (speaking) {
                            voice.stop();
                            return;
                          }
                          voice.unlock();
                          void c.withFace(() => voice.speak(item.id, speakableText(item.reply, item.crisis?.message, item.language), undefined, item.language, c.ttsUrl(item.replyId)));
                        }}
                      >
                        {speaking ? <StopIcon width={16} height={16} /> : <VolumeIcon width={16} height={16} />}
                        {speaking ? 'Stop' : 'Listen'}
                      </button>
                    ) : null}
                  </div>
                  {item.crisis ? <CrisisCard crisis={item.crisis} /> : null}
                  {item.reply.acknowledge ? <p className="krishna-words">{item.reply.acknowledge}</p> : null}
                  {item.verses.map((verse) => (
                    <VerseCard key={verseRef(verse)} verse={verse} actions={c.actionsFor(verse)} />
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
                  {item.reply.question ? <p className="krishna-words">{item.reply.question}</p> : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
