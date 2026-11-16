'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { Familiarity, Tone } from '@/lib/companion';
import type { DisplayVerse } from '@/lib/corpus';
import { speakableName, STAGE_LINES, welcomeLine, type StageLineId } from '@/lib/greeting';
import { speakableText, voiceForLanguage } from '@/lib/speech';
import { BookmarkIcon, CompassIcon, DiyaIcon, FlameIcon, MicIcon, RainIcon, ShareIcon, StopIcon, VolumeIcon } from '../icons';
import { verseRef } from '../saved';
import { IconButton, verseToSpeak } from '../verse-card';
import { useConversation, type AskPrompt, type AssistantMessage, type Flow, type Stage } from './conversation';
import { StageFace } from './stage-face';
import { FAMILIARITY_CHOICES, MemoryPanel, SettingsPanel, TONE_CHOICES, TranscriptPanel } from './stage-panels';
import { BookArt, ChatBubbleArt, cleanSanskrit, CrisisCard, LeafArt, LotusMark, Message, Ornament, Parchment, QuestionArt, Waveform } from './stage-parts';

type Pose = 'welcome' | 'blessing' | 'listening' | 'offering' | 'guide' | 'heart' | 'teaching';

/** Each pose image and where Krishna sits in it, so a narrow screen can centre on him. */
const POSES: { id: Pose; focus: string }[] = [
  { id: 'welcome', focus: '49%' },
  { id: 'blessing', focus: '43%' },
  { id: 'listening', focus: '50%' },
  { id: 'offering', focus: '36%' },
  { id: 'guide', focus: '24%' },
  { id: 'heart', focus: '30%' },
  { id: 'teaching', focus: '30%' },
];

const STAGE_LABELS: Record<Stage, string> = {
  understanding: 'Krishna is listening',
  searching: 'Finding a verse for you',
  choosing: 'Choosing the verse',
  writing: 'Krishna is reflecting',
};

const TALK_LABELS: Record<string, string> = {
  listening: 'I am listening',
  thinking: 'Reflecting on your words',
  speaking: 'Krishna is speaking',
  paused: 'Paused',
};

const STARTERS = [
  { icon: RainIcon, title: 'Fear', text: 'I am afraid and I do not know what to do' },
  { icon: CompassIcon, title: 'Duty', text: 'I know my duty but I do not want to do it' },
  { icon: DiyaIcon, title: 'Grief', text: 'I lost someone I love and the grief is heavy' },
  { icon: FlameIcon, title: 'A quarrel', text: 'I am in a quarrel and I cannot let it go' },
];

const ASK_LINES: Record<AskPrompt, string> = {
  open: STAGE_LINES.open.show,
  question: STAGE_LINES.question.show,
  verse: STAGE_LINES.verse.show,
  more: STAGE_LINES.more.show,
};

type SpokenLine = { id: string; url: string; text: string };

function fixedLine(id: StageLineId): SpokenLine {
  return { id: `line-${id}`, url: `/api/tts?line=${id}`, text: STAGE_LINES[id].say };
}

/** What Krishna says aloud at each point of the guided conversation, if anything. */
function lineFor(flow: Flow, name: string): SpokenLine | null {
  switch (flow.at) {
    case 'name':
      return fixedLine('name');
    case 'tone':
      return fixedLine('tone');
    case 'know':
      return fixedLine('know');
    case 'intro': {
      if (flow.step === 0) {
        const spoken = speakableName(name);
        const query = spoken ? `&name=${encodeURIComponent(spoken)}` : '';
        return { id: 'line-welcome', url: `/api/tts?welcome=1${query}`, text: welcomeLine(spoken) };
      }
      return fixedLine(flow.step === 1 ? 'here' : 'share');
    }
    case 'compassion':
      return fixedLine('compassion');
    case 'ask':
      // His own question was already spoken at the end of his reply.
      return flow.text ? null : fixedLine(flow.prompt);
    case 'guidance':
      return fixedLine('guidance');
    default:
      return null;
  }
}

/** Shortest time a timed line stays on screen, and the longest it waits for speech to finish. */
const LINE_MIN_MS = 2200;
const LINE_MAX_MS = 15_000;

type Beat = { kind: 'line'; text: string; pose: Pose; long?: boolean } | { kind: 'verse'; verse: DisplayVerse } | { kind: 'practice'; text: string };

function beatsFor(message: AssistantMessage | null): Beat[] {
  if (!message) return [];
  const beats: Beat[] = [];
  if (message.reply.acknowledge) beats.push({ kind: 'line', text: message.reply.acknowledge, pose: 'heart', long: message.reply.acknowledge.length > 120 });
  // The verse waits for the first words, so Krishna speaks before he quotes.
  if (message.reply.acknowledge) for (const verse of message.verses) beats.push({ kind: 'verse', verse });
  if (message.reply.connection) beats.push({ kind: 'line', text: message.reply.connection, pose: 'offering', long: message.reply.connection.length > 120 });
  if (message.reply.step) beats.push({ kind: 'practice', text: message.reply.step });
  return beats;
}

/** The opening scene. One tap on Enter lets the browser play Krishna's voice from then on. */
function Entrance({ onEnter }: { onEnter: () => void }) {
  const [ready, setReady] = useState(false);
  const enterRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 1600);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (ready) enterRef.current?.focus();
  }, [ready]);
  return (
    <div className="stage-entrance">
      <img className="stage-entrance-plate" src="/gitalens/entrance.webp" alt="" />
      <div className="stage-entrance-body">
        <LotusMark className="stage-entrance-lotus" />
        <h1 className="stage-entrance-title">GitaLens</h1>
        <p className="stage-entrance-sub">Speak with Krishna</p>
        {ready ? (
          <button ref={enterRef} type="button" className="stage-pill stage-pill-primary stage-enter" onClick={onEnter}>
            Enter
          </button>
        ) : (
          <span className="stage-spinner" aria-hidden="true" />
        )}
        <p className="stage-entrance-status" role="status">
          {ready ? 'Tap Enter to begin the Divine Conversation' : 'Entering the Divine Conversation…'}
        </p>
      </div>
    </div>
  );
}

function ShlokaPlayer({ verse }: { verse: DisplayVerse }) {
  const c = useConversation();
  const { voice } = c;
  const id = `shloka-${verseRef(verse)}`;
  const playing = voice.speakingId === id;
  if (!voice.supported) return null;
  return (
    <button
      type="button"
      className="stage-player"
      aria-pressed={playing}
      aria-label={playing ? 'Stop the verse' : 'Hear the verse'}
      onClick={() => {
        if (playing) {
          voice.stop();
          return;
        }
        // The device reads the stored Sanskrit if it has a Hindi voice; otherwise it reads the meaning.
        if (voiceForLanguage(voice.voices, 'hi')) voice.speak(id, cleanSanskrit(verse).replace(/[।॥]/g, '. '), undefined, 'hi');
        else voice.speak(id, verseToSpeak(verse));
      }}
    >
      <span className="stage-player-button">
        {playing ? (
          <StopIcon width={22} height={22} />
        ) : (
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path fill="currentColor" d="M8 5v14l11-7z" />
          </svg>
        )}
      </span>
      <Waveform active={playing} />
    </button>
  );
}

export function StageScreen() {
  const c = useConversation();
  const { flow, setFlow, voice, talk, talking, dictation, messages } = c;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [nameDraft, setNameDraft] = useState('');

  const last = messages[messages.length - 1];
  const assistant = last?.role === 'assistant' ? last : null;
  const beats = useMemo(() => beatsFor(assistant), [assistant]);
  const latestReply = [...messages].reverse().find((item) => item.role !== 'user');
  const activeCrisis = latestReply?.role === 'assistant' || latestReply?.role === 'error' ? latestReply.crisis : null;

  const introSteps = useMemo(
    () => [
      { pose: 'welcome' as Pose, node: <Message tone="welcome">{c.name ? `Welcome,\n${c.name}!` : 'Welcome!'}</Message> },
      { pose: 'blessing' as Pose, node: <Message>{STAGE_LINES.here.show}</Message> },
      { pose: 'offering' as Pose, node: <Message>{STAGE_LINES.share.show}</Message> },
    ],
    [c.name],
  );

  // Krishna speaks each line as it appears. Timed lines move on once he has finished speaking
  // (or after a short pause when his voice is off); every one of them can be skipped.
  const flowKey = JSON.stringify(flow);
  useEffect(() => {
    if (talking) return;
    const next: Flow | null =
      flow.at === 'intro'
        ? flow.short || flow.step + 1 >= introSteps.length
          ? { at: 'choices' }
          : { at: 'intro', step: flow.step + 1 }
        : flow.at === 'compassion'
          ? { at: 'ask', prompt: 'open' }
          : null;
    let spoken = false;
    let shown = false;
    let moved = false;
    const move = () => {
      if (!next || moved) return;
      moved = true;
      setFlow(next);
    };
    const line = lineFor(flow, c.name);
    const speaking = line
      ? c.speakLine(line.id, line.url, line.text, () => {
          spoken = true;
          if (shown) move();
        })
      : false;
    if (!speaking) spoken = true;
    const minTimer = window.setTimeout(() => {
      shown = true;
      if (spoken) move();
    }, speaking ? LINE_MIN_MS : LINE_MIN_MS + 1200);
    const maxTimer = next ? window.setTimeout(move, LINE_MAX_MS) : undefined;
    return () => {
      window.clearTimeout(minTimer);
      window.clearTimeout(maxTimer);
    };
    // Runs once per point in the conversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowKey, talking]);

  function skipTo(target: Flow) {
    voice.stop();
    setFlow(target);
  }

  useEffect(() => {
    if (flow.at === 'ask') textareaRef.current?.focus();
  }, [flow]);

  useEffect(() => {
    const box = textareaRef.current;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, 132)}px`;
    box.style.overflowY = box.scrollHeight > 132 ? 'auto' : 'hidden';
  }, [c.draft]);

  // Leaving this page ends anything live, but the conversation itself stays.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => c.leaveStage(), []);

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

  const inVerseMode = flow.at === 'ask' && flow.prompt === 'verse';
  const canSend = c.pending === null && c.draft.trim().length > 0;

  function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (dictation.listening) dictation.cancel();
    if (!canSend) return;
    // A tap here is enough for the browser to allow Krishna's voice for the reply.
    if (c.autoPlay) c.wakeFace();
    if (inVerseMode) void c.understandVerse(c.draft);
    else void c.sendMessage(c.draft);
  }

  function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    c.setName(nameDraft);
    setFlow({ at: 'tone' });
  }

  function chooseTone(value: Tone) {
    c.companion.setTone(value);
    skipTo({ at: 'know' });
  }

  function chooseFamiliarity(value: Familiarity) {
    c.companion.setFamiliarity(value);
    skipTo({ at: 'intro', step: 0 });
  }

  function skipName() {
    c.setName('');
    setFlow({ at: 'intro', step: 0 });
  }

  function listenToReply(message: AssistantMessage) {
    if (voice.speakingId === message.id) {
      voice.stop();
      return;
    }
    voice.unlock();
    void c.withFace(() => voice.speak(message.id, speakableText(message.reply, message.crisis?.message, message.language), undefined, message.language, c.ttsUrl(message.replyId)));
  }

  let pose: Pose = 'offering';
  let body: ReactNode = null;
  /** Controls that must stay in view however long the words above them are. */
  let footer: ReactNode = null;
  let showComposer = false;

  if (talking) {
    pose = talk.state.mode === 'speaking' ? 'teaching' : 'listening';
    const lastReply = [...messages].reverse().find((item) => item.role === 'assistant');
    body = (
      <>
        <Message>{talk.state.mode === 'listening' && dictation.transcribing ? 'Understanding your words' : TALK_LABELS[talk.state.mode]}</Message>
        {c.avatarOn && (c.avatarState === 'ended' || c.avatarState === 'failed') ? (
          <p className="stage-caption">{c.avatarState === 'ended' ? 'Krishna’s video has paused. We will keep talking.' : 'Krishna’s video could not start. We will keep talking.'}</p>
        ) : null}
        <Waveform
          className="stage-wave-lg"
          active={talk.state.mode === 'speaking' || talk.state.mode === 'thinking'}
          level={talk.state.mode === 'listening' && dictation.listening && c.recorder.supported ? dictation.level : undefined}
        />
        {talk.state.mode === 'listening' && dictation.interim ? <p className="stage-caption">{dictation.interim}</p> : null}
        {talk.state.mode === 'speaking' && lastReply?.role === 'assistant' && lastReply.reply.acknowledge ? <p className="stage-caption">{lastReply.reply.acknowledge}</p> : null}
        {talk.state.mode === 'paused' && talk.state.note ? <p className="stage-caption">{talk.state.note}</p> : null}
        <div className="stage-actions">
          {talk.state.mode === 'speaking' ? (
            <button type="button" className="stage-pill stage-pill-primary" onClick={talk.interrupt}>
              Interrupt
            </button>
          ) : null}
          {talk.state.mode === 'paused' ? (
            <button type="button" className="stage-pill stage-pill-primary" onClick={c.startTalk}>
              <MicIcon /> Continue
            </button>
          ) : null}
          <button type="button" className="stage-pill" onClick={talk.end}>
            End conversation
          </button>
        </div>
      </>
    );
  } else if (flow.at === 'name') {
    pose = 'blessing';
    body = (
      <>
        <Message>{STAGE_LINES.name.show}</Message>
        <Ornament />
        <form className="stage-name" onSubmit={saveName}>
          <label htmlFor="stage-name" className="sr-only">
            Your name
          </label>
          <input id="stage-name" className="stage-input" value={nameDraft} maxLength={40} autoComplete="given-name" placeholder="Your name" onChange={(event) => setNameDraft(event.target.value)} />
          <button type="submit" className="stage-pill stage-pill-primary" disabled={!nameDraft.trim()}>
            Continue
          </button>
        </form>
        <button type="button" className="stage-skip" onClick={skipName}>
          Continue without a name
        </button>
      </>
    );
  } else if (flow.at === 'tone') {
    pose = 'offering';
    body = (
      <>
        <Message>{STAGE_LINES.tone.show}</Message>
        <div className="stage-actions" role="group" aria-label="How Krishna speaks with you">
          {TONE_CHOICES.map((choice) => (
            <button key={choice.value} type="button" className="stage-pill" onClick={() => chooseTone(choice.value)}>
              {choice.label}
            </button>
          ))}
        </div>
        <button type="button" className="stage-skip" onClick={() => skipTo({ at: 'know' })}>
          Skip
        </button>
      </>
    );
  } else if (flow.at === 'know') {
    pose = 'teaching';
    body = (
      <>
        <Message>{STAGE_LINES.know.show}</Message>
        <div className="stage-actions" role="group" aria-label="How well you know the Gita">
          {FAMILIARITY_CHOICES.map((choice) => (
            <button key={choice.value} type="button" className="stage-pill" onClick={() => chooseFamiliarity(choice.value)}>
              {choice.label}
            </button>
          ))}
        </div>
        <button type="button" className="stage-skip" onClick={() => skipTo({ at: 'intro', step: 0 })}>
          Skip
        </button>
      </>
    );
  } else if (flow.at === 'intro') {
    const step = introSteps[flow.step] ?? introSteps[0];
    pose = step.pose;
    body = (
      <>
        {step.node}
        <Ornament />
        <button type="button" className="stage-skip" onClick={() => skipTo({ at: 'choices' })}>
          Skip
        </button>
      </>
    );
  } else if (flow.at === 'choices') {
    pose = 'guide';
    showComposer = true;
    const choices = [
      { label: 'Share your feelings', art: <ChatBubbleArt />, go: () => setFlow({ at: 'compassion' }) },
      { label: 'Ask a question', art: <QuestionArt />, go: () => setFlow({ at: 'ask', prompt: 'question' }) },
      { label: 'Understand a verse', art: <BookArt />, go: () => setFlow({ at: 'ask', prompt: 'verse' }) },
      { label: 'Find guidance', art: <LeafArt />, go: () => setFlow({ at: 'guidance' }) },
    ];
    body = (
      <div className="stage-choices">
        {choices.map((choice) => (
          <button key={choice.label} type="button" className="stage-choice" onClick={choice.go}>
            <span className="stage-choice-art">{choice.art}</span>
            <span className="stage-choice-label">{choice.label}</span>
          </button>
        ))}
      </div>
    );
  } else if (flow.at === 'compassion') {
    pose = 'heart';
    body = (
      <>
        <Message tone="long">{STAGE_LINES.compassion.show}</Message>
        <Ornament />
        <button type="button" className="stage-skip" onClick={() => skipTo({ at: 'ask', prompt: 'open' })}>
          Skip
        </button>
      </>
    );
  } else if (flow.at === 'guidance') {
    pose = 'offering';
    showComposer = true;
    body = (
      <>
        <Message>{STAGE_LINES.guidance.show}</Message>
        <div className="stage-starters">
          {STARTERS.map((starter) => (
            <button key={starter.title} type="button" className="stage-choice stage-choice-compact" onClick={() => void c.sendMessage(starter.text)} disabled={c.pending !== null}>
              <span className="stage-choice-art stage-choice-icon">
                <starter.icon />
              </span>
              <span className="stage-choice-label">{starter.title}</span>
            </button>
          ))}
        </div>
        <button type="button" className="stage-skip" onClick={() => skipTo({ at: 'choices' })}>
          Back
        </button>
      </>
    );
  } else if (flow.at === 'ask') {
    pose = 'offering';
    showComposer = true;
    body = (
      <>
        <Message tone={flow.text && flow.text.length > 120 ? 'long' : undefined}>{flow.text ?? ASK_LINES[flow.prompt]}</Message>
        <Ornament />
        <button type="button" className="stage-skip" onClick={() => skipTo({ at: 'choices' })}>
          See the choices
        </button>
      </>
    );
  } else if (flow.at === 'reply') {
    showComposer = true;
    const streaming = assistant?.streaming === true;
    const index = Math.min(flow.beat, Math.max(0, beats.length - 1));
    const beat = beats[index];
    if (activeCrisis && !streaming) {
      // A crisis message replaces ordinary guidance: only the helplines and the way to keep talking remain.
      pose = 'heart';
    } else if (last?.role === 'error') {
      pose = 'offering';
      body = (
        <>
          <p className="stage-error" role="alert">
            {last.text}
          </p>
          <button type="button" className="stage-skip" onClick={() => skipTo({ at: 'choices' })}>
            See the choices
          </button>
        </>
      );
    } else if (!beat) {
      pose = 'listening';
      showComposer = false;
      body = (
        <>
          <Message>{STAGE_LABELS[c.stage]}</Message>
          <Waveform className="stage-wave-lg" active />
        </>
      );
    } else {
      const atEnd = index === beats.length - 1;
      const speaking = assistant ? voice.speakingId === assistant.id : false;
      // When Krishna only talked or asked, the person answers right here; there is nothing to continue to.
      const answerHere = atEnd && !streaming && assistant?.status === 'conversation' && assistant.verses.length === 0;
      const question = assistant?.reply.question || undefined;
      if (beat.kind === 'line') {
        pose = beat.pose;
        body = (
          <>
            <Message tone={beat.long ? 'long' : undefined}>{beat.text}</Message>
            <Ornament />
          </>
        );
      } else if (beat.kind === 'verse') {
        pose = 'teaching';
        const actions = c.actionsFor(beat.verse);
        body = (
          <>
            <p className="stage-verse-intro">
              The Bhagavad Gita <br />
              teaches in <br />
              Chapter {beat.verse.chapter}, Verse {beat.verse.verse}:
            </p>
            <Parchment verse={beat.verse} />
            <div className="stage-verse-row">
              <ShlokaPlayer verse={beat.verse} />
              <IconButton label={actions.saved ? 'Remove from My Gita' : 'Save to My Gita'} pressed={actions.saved} onClick={actions.onToggleSave}>
                <BookmarkIcon filled={actions.saved} />
              </IconButton>
              <IconButton label={actions.sharing ? 'Preparing image' : 'Share as image'} disabled={actions.sharing} onClick={actions.onShare}>
                <ShareIcon />
              </IconButton>
            </div>
            <p className="stage-verse-meaning">
              {beat.verse.summary ?? beat.verse.englishTranslation}{' '}
              <Link className="stage-verse-open" href={`/gita/${beat.verse.chapter}#v${beat.verse.verse}`}>
                Open in the Gita
              </Link>
            </p>
          </>
        );
      } else {
        pose = 'blessing';
        body = (
          <>
            <p className="stage-verse-intro">One step for today</p>
            <Message tone="long">{beat.text}</Message>
            <Ornament />
          </>
        );
      }
      footer = (
        <>
          <div className="stage-steps">
            {index > 0 ? (
              <button type="button" className="stage-pill" onClick={() => setFlow({ at: 'reply', beat: index - 1 })}>
                Back
              </button>
            ) : null}
            {voice.supported && assistant && !streaming ? (
              <button type="button" className="stage-pill" aria-pressed={speaking} onClick={() => listenToReply(assistant)}>
                {speaking ? 'Stop' : 'Listen'}
              </button>
            ) : null}
            {atEnd && streaming ? (
              <span className="stage-steps-wait" role="status">
                Krishna is still speaking…
              </span>
            ) : answerHere ? null : (
              <button type="button" className="stage-pill stage-pill-primary" onClick={() => setFlow(atEnd ? { at: 'ask', prompt: 'more', text: question } : { at: 'reply', beat: index + 1 })}>
                Continue
              </button>
            )}
          </div>
          <p className="stage-dots" aria-label={`Part ${index + 1} of ${beats.length}`}>
            {beats.map((_, dot) => (
              <span key={dot} data-on={dot === index || undefined} />
            ))}
          </p>
        </>
      );
    }
  }

  const panelKey = talking ? `talk-${talk.state.mode}` : flow.at === 'reply' ? `reply-${flow.beat}` : flow.at === 'intro' ? `intro-${flow.step}` : flow.at === 'ask' ? `ask-${flow.prompt}` : flow.at;
  // While his live face is up, the scene shows the painting it was made from, so the two line up.
  const faceLive = c.avatarOn && (c.avatarState === 'ready' || c.avatarState === 'speaking');
  if (faceLive) pose = 'welcome';

  function enter() {
    c.wakeFace();
    c.finishEntrance();
  }

  if (flow.at === 'entrance' && !talking) {
    return (
      <main className="stage">
        <Entrance onEnter={enter} />
      </main>
    );
  }

  return (
    <main className="stage" data-pose={pose}>
      <div className="stage-plate" aria-hidden="true">
        {POSES.map((item) => (
          <img
            key={item.id}
            src={`/gitalens/${item.id}.webp`}
            alt=""
            data-pose={item.id}
            data-on={item.id === pose || undefined}
            style={{ '--focus-narrow': item.focus } as React.CSSProperties}
          />
        ))}
        {c.avatarOn ? <StageFace live={faceLive} /> : null}
      </div>
      <div className="stage-shade" aria-hidden="true" />

      {voice.supported ? (
        <button
          type="button"
          className="stage-sound"
          aria-pressed={c.autoPlay}
          aria-label={c.autoPlay ? 'Krishna’s voice is on. Turn it off' : 'Krishna’s voice is off. Turn it on'}
          title={c.autoPlay ? 'Voice on' : 'Voice off'}
          onClick={() => {
            if (!c.autoPlay) c.wakeFace();
            c.changeAutoPlay(!c.autoPlay);
          }}
        >
          {c.autoPlay ? (
            <VolumeIcon />
          ) : (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 10v4h4l5 4V6L8 10z" />
              <path d="M17 9l5 6M22 9l-5 6" />
            </svg>
          )}
        </button>
      ) : null}

      <section className="stage-panel" aria-live="polite">
        {/* Helplines stay on screen in every state, including voice, until the conversation moves on. */}
        {activeCrisis ? <CrisisCard crisis={activeCrisis} /> : null}
        <div className="stage-panel-body">
          <div key={panelKey} className="stage-panel-inner">
            {body}
          </div>
        </div>
        {footer ? <div className="stage-panel-foot">{footer}</div> : null}
      </section>

      {showComposer && !talking ? (
        <form className="stage-composer" onSubmit={submit}>
          {dictation.listening || dictation.transcribing || c.formError ? (
            <div className="stage-composer-status" role="status">
              {dictation.listening ? (
                <>
                  <span className="rec-dot" aria-hidden="true" />
                  <span>{c.recorder.supported ? 'Listening… tap stop when you are done' : `Listening… ${dictation.interim}`}</span>
                  {c.recorder.supported ? <Waveform level={dictation.level} active className="stage-wave-sm" /> : null}
                </>
              ) : dictation.transcribing ? (
                <span>Turning your words into text…</span>
              ) : (
                <span className="composer-error">{c.formError}</span>
              )}
            </div>
          ) : null}
          <div className="stage-composer-box">
            {dictation.supported ? (
              <button
                type="button"
                className={`stage-mic ${dictation.listening ? 'is-live' : ''}`}
                aria-label={dictation.listening ? 'Stop recording' : 'Speak instead of typing'}
                title={dictation.listening ? 'Stop recording' : 'Speak instead of typing'}
                aria-pressed={dictation.listening}
                onClick={c.toggleMic}
                disabled={c.pending !== null || dictation.transcribing}
              >
                {dictation.listening ? <StopIcon width={26} height={26} /> : <MicIcon width={26} height={26} />}
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
              value={c.draft}
              placeholder={inVerseMode ? 'Chapter and verse, like 2.47' : 'Type anything…'}
              disabled={c.pending !== null}
              onChange={(event) => c.setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
            />
            <button type="submit" className="stage-send" aria-label="Send" title="Send" disabled={!canSend}>
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <p className="stage-note">
            An AI guide inspired by the Bhagavad Gita, not a substitute for professional help.
            {c.draft.length > 1500 ? ` ${c.draft.length}/2000` : ''}
          </p>
        </form>
      ) : null}

      {c.panel === 'settings' ? <SettingsPanel /> : null}
      {c.panel === 'transcript' ? <TranscriptPanel /> : null}
      {c.panel === 'memory' ? <MemoryPanel /> : null}
    </main>
  );
}
