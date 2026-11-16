'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { DisplayVerse } from '@/lib/corpus';
import { KRISHNA_GREETING, generatePersonalizedGreeting } from '@/lib/greeting';
import {
  defaultProfile,
  PERSONA_DESCRIPTIONS,
  readProfile,
  writeProfile,
  type CompanionPersona,
  type DevoteeProfile,
  PROFILE_EVENT,
} from '@/lib/profile';
import {
  type CompanionMemory,
  type MemoryCategory,
  MEMORY_CATEGORIES,
  readMemories,
  writeMemories,
  mergeMemories,
  MEMORIES_EVENT,
  memoryId,
} from '@/lib/memory';
import type { User } from '@supabase/supabase-js';
import {
  getCurrentUser,
  getSupabase,
  isSupabaseConfigured,
  signInWithEmail,
  signInWithGoogle,
  signOut,
} from '@/lib/supabase';
import { migrateGuestDataToCloud, pullCloudUserData } from '@/lib/sync';
import { speakableText } from '@/lib/speech';
import { avatarEngine } from './avatar/anam-engine';
import { KrishnaAvatar, useAvatarState } from './avatar/krishna-avatar';
import {
  CloseIcon,
  Lotus,
  MicIcon,
  SendIcon,
  SlidersIcon,
  VolumeIcon,
} from './icons';
import { useSavedVerses, verseRef } from './saved';
import { shareVerse } from './share-card';
import { uid } from './uid';
import { VerseCard, type VerseActions, verseToSpeak } from './verse-card';
import {
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
  error?: string;
  newMemories?: { fact: string; category?: MemoryCategory; associatedVerse?: string }[];
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
    streaming?: boolean;
  }
  | { id: string; role: 'error'; text: string; crisis: Crisis };

const UNAVAILABLE_TEXT = 'Let us pause for a moment. Please speak with me again.';
const UNAVAILABLE_SPOKEN = 'Let us pause for a moment. Please speak with me again in a little while.';
const NATURAL_KEY = 'gita.naturalVoice';
const AVATAR_KEY = 'gita.avatar';
const FACE_WAIT_MS = 6000;
const MIC_LANG_KEY = 'gita.micLang';
const MIC_LANGS = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'hi-IN', label: 'Hindi' },
  { code: 'ta-IN', label: 'Tamil' },
];

async function readStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: StreamEvent) => void,
): Promise<ChatResponse | null> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done: ChatResponse | null = null;
  const handle = (line: string) => {
    if (!line.trim()) return;
    try {
      const event = JSON.parse(line) as StreamEvent;
      if (event.type === 'done') done = event;
      else onEvent(event);
    } catch {
      // Ignore partial json lines
    }
  };
  for (; ;) {
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

export function SanctuaryScreen({ daily }: { daily: DisplayVerse | null }) {
  const [sessionId] = useState(() => uid());
  const [callActive, setCallActive] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [personalizeOpen, setPersonalizeOpen] = useState(false);
  const [memoriesOpen, setMemoriesOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPending, setAuthPending] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [profile, setProfile] = useState<DevoteeProfile>(defaultProfile);
  const [profileDraft, setProfileDraft] = useState<DevoteeProfile>(defaultProfile);
  const [memories, setMemories] = useState<CompanionMemory[]>([]);
  const [newMemoryText, setNewMemoryText] = useState('');
  const [newMemoryCategory, setNewMemoryCategory] = useState<MemoryCategory>('life_context');
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [verseDrawer, setVerseDrawer] = useState<DisplayVerse | null>(null);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [sharingRef, setSharingRef] = useState<string | null>(null);

  // Live streaming subtitle queue (strictly 1-2 lines)
  const [caption, setCaption] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const wordQueueRef = useRef<string[]>([]);
  const streamIntervalRef = useRef<number | null>(null);
  const currentWindowRef = useRef<string>('');
  const pauseUntilRef = useRef<number>(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [service, setService] = useState({ tts: false, stt: false, avatar: false });
  const [naturalPref, setNaturalPref] = useState(true);
  const [avatarPref, setAvatarPref] = useState(true);
  const [micLang, setMicLang] = useState('en-IN');
  const [sttDown, setSttDown] = useState(false);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [pending, setPending] = useState<'send' | null>(null);

  const savedVerses = useSavedVerses();
  const endRef = useRef<HTMLDivElement>(null);

  const naturalVoice = service.tts && naturalPref;
  const avatarOn = naturalVoice && service.avatar && avatarPref;
  const voice = useKrishnaVoice(naturalVoice, avatarOn);
  useAvatarState();

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

  function flash(text: string) {
    setNotice(text);
    window.setTimeout(() => setNotice((curr) => (curr === text ? '' : curr)), 3200);
  }

  async function share(verse: DisplayVerse) {
    const ref = verseRef(verse);
    setSharingRef(ref);
    try {
      const result = await shareVerse(verse);
      if (result === 'downloaded') flash('Image saved to downloads');
    } catch {
      flash('Image could not be created. Please try again.');
    } finally {
      setSharingRef(null);
    }
  }

  function actionsFor(verse: DisplayVerse): VerseActions {
    const saved = savedVerses.isSaved(verse);
    const hearing = voice.speakingId === verseRef(verse);
    return {
      saved,
      sharing: sharingRef === verseRef(verse),
      hearing,
      onHear: voice.supported
        ? () => {
          if (hearing) voice.stop();
          else voice.speak(verseRef(verse), verseToSpeak(verse));
        }
        : undefined,
      onToggleSave: () => {
        savedVerses.toggle(verse);
        flash(saved ? 'Removed from My Gita' : 'Saved to My Gita');
      },
      onShare: () => void share(verse),
    };
  }

  function unlockAudio() {
    voice.unlock();
    avatarEngine().unmute();
    const video = document.getElementById('krishna-avatar-video') as HTMLVideoElement | null;
    if (video) {
      video.muted = false;
      void video.play().catch(() => undefined);
    }
  }

  function pushWordsToStream(text: string, clearFirst = false) {
    if (clearFirst) {
      wordQueueRef.current = [];
      currentWindowRef.current = '';
      pauseUntilRef.current = 0;
      setCaption('');
    }
    const words = text.split(/\s+/).filter(Boolean);
    wordQueueRef.current.push(...words);
    setIsStreaming(true);

    if (!streamIntervalRef.current) {
      streamIntervalRef.current = window.setInterval(() => {
        const now = Date.now();
        if (now < pauseUntilRef.current) {
          return;
        }

        if (wordQueueRef.current.length > 0) {
          const current = currentWindowRef.current;
          const endsSentence = /[.?!।]$/.test(current.trim());
          const wordCount = current.trim().split(/\s+/).filter(Boolean).length;

          // When a sentence finishes (>= 4 words) or line reaches 13 words:
          // Hold the completed 2-line subtitle for 2.2 seconds before rolling!
          if (endsSentence && wordCount >= 4) {
            pauseUntilRef.current = now + 2200;
            currentWindowRef.current = '';
            return;
          }

          if (wordCount >= 13) {
            pauseUntilRef.current = now + 1800;
            currentWindowRef.current = '';
            return;
          }

          const nextWord = wordQueueRef.current.shift()!;
          currentWindowRef.current = current ? `${current} ${nextWord}` : nextWord;
          setCaption(currentWindowRef.current);
        } else {
          if (streamIntervalRef.current) {
            window.clearInterval(streamIntervalRef.current);
            streamIntervalRef.current = null;
          }
          setIsStreaming(false);
        }
      }, 160);
    }
  }

  useEffect(() => {
    const loaded = readProfile();
    setProfile(loaded);
    setProfileDraft(loaded);

    const loadedMemories = readMemories();
    setMemories(loadedMemories);

    const onProfileChange = () => {
      const refreshed = readProfile();
      setProfile(refreshed);
      setProfileDraft(refreshed);
    };

    const onMemoriesChange = () => {
      setMemories(readMemories());
    };

    window.addEventListener(PROFILE_EVENT, onProfileChange);
    window.addEventListener(MEMORIES_EVENT, onMemoriesChange);

    // Check initial user and listen to Supabase auth state
    void getCurrentUser().then((u) => {
      setUser(u);
      if (u) {
        void pullCloudUserData(u.id);
      }
    });

    const sb = getSupabase();
    const authSubscription = sb?.auth.onAuthStateChange(async (event, session) => {
      const authUser = session?.user ?? null;
      setUser(authUser);
      if (authUser && (event === 'SIGNED_IN' || event === 'USER_UPDATED')) {
        await migrateGuestDataToCloud(authUser.id);
        await pullCloudUserData(authUser.id);
        const name = authUser.email ? authUser.email.split('@')[0] : 'Devotee';
        flash(`Welcome, ${name}! Your journey & memories are synced.`);
      }
    });

    setNaturalPref(readPref(NATURAL_KEY) !== '0');
    setAvatarPref(readPref(AVATAR_KEY) !== '0');
    const savedLang = readPref(MIC_LANG_KEY);
    if (savedLang && MIC_LANGS.some((item) => item.code === savedLang)) setMicLang(savedLang);

    fetch('/api/voice')
      .then((res) => (res.ok ? res.json() : { tts: false, stt: false, avatar: false }))
      .then((data: { tts?: boolean; stt?: boolean; avatar?: boolean }) => {
        setService({ tts: Boolean(data.tts), stt: Boolean(data.stt), avatar: Boolean(data.avatar) });
      })
      .catch(() => undefined);

    return () => {
      window.removeEventListener(PROFILE_EVENT, onProfileChange);
      window.removeEventListener(MEMORIES_EVENT, onMemoriesChange);
      authSubscription?.data?.subscription?.unsubscribe();
      if (streamIntervalRef.current) {
        window.clearInterval(streamIntervalRef.current);
        streamIntervalRef.current = null;
      }
    };
  }, []);

  // Auto-connect live video avatar when available
  useEffect(() => {
    if (avatarOn) {
      void avatarEngine().connect();
    }
  }, [avatarOn]);

  // Auto-resize textarea to fit multiline user reflections smoothly
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
    }
  }, [draft]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }

  function ttsUrl(replyId?: string): string | undefined {
    return replyId
      ? `/api/tts?sessionId=${encodeURIComponent(sessionId)}&replyId=${encodeURIComponent(replyId)}`
      : undefined;
  }

  async function withFace(speakNow: () => void) {
    if (!avatarOn) {
      speakNow();
      return;
    }
    await Promise.race([
      avatarEngine().connect(),
      new Promise((resolve) => window.setTimeout(resolve, FACE_WAIT_MS)),
    ]);
    speakNow();
  }

  async function sendMessage(text: string): Promise<TalkTurn> {
    const message = text.trim();
    if (!message) return { speak: '', pause: true };
    setPending('send');
    setDraft('');
    wordQueueRef.current = [];
    currentWindowRef.current = '';
    setCaption('');
    setIsStreaming(true);
    setMessages((curr) => [...curr, { id: uid(), role: 'user', text: message }]);

    const id = uid();
    const withoutDraft = (curr: UiMessage[]) => curr.filter((item) => item.id !== id);
    const patchDraft = (change: (item: Extract<UiMessage, { role: 'assistant' }>) => Extract<UiMessage, { role: 'assistant' }>) =>
      setMessages((curr) => {
        const index = curr.findIndex((item) => item.id === id);
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
          return [...curr, change(empty)];
        }
        const item = curr[index];
        if (item.role !== 'assistant') return curr;
        const next = [...curr];
        next[index] = change(item);
        return next;
      });

    const onEvent = (event: StreamEvent) => {
      if (event.type === 'verses') {
        if (event.verses.length > 0 || event.crisis) {
          patchDraft((item) => ({ ...item, verses: event.verses, crisis: event.crisis }));
        }
      } else if (event.type === 'delta') {
        pushWordsToStream(event.text, false);
        patchDraft((item) => ({
          ...item,
          reply: { ...item.reply, [event.field]: item.reply[event.field] + event.text },
        }));
      } else if (event.type === 'reset') {
        wordQueueRef.current = [];
        currentWindowRef.current = '';
        setCaption('');
        patchDraft((item) => ({ ...item, reply: { acknowledge: '', connection: '', step: '' } }));
      }
    };

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message, stream: true, profile, memories }),
      });
      const streamed = response.ok && response.body && (response.headers.get('content-type') ?? '').includes('ndjson');
      const data = streamed ? await readStream(response.body!, onEvent) : ((await response.json()) as ChatResponse);

      if (data?.newMemories && data.newMemories.length > 0) {
        const merged = mergeMemories(readMemories(), data.newMemories);
        writeMemories(merged);
        setMemories(merged);
        const snippet = data.newMemories[0].fact.slice(0, 45);
        flash(`Krishna remembered: "${snippet}…"`);
      }

      if (!data || !response.ok || data.status === 'unavailable') {
        const crisis = data?.crisis ?? null;
        const fallbackText = data?.error || data?.guidance || UNAVAILABLE_TEXT;
        setMessages((curr) => [
          ...withoutDraft(curr),
          { id: uid(), role: 'error', text: fallbackText, crisis },
        ]);
        pushWordsToStream(crisis ? crisis.message : UNAVAILABLE_TEXT, true);
        return { speak: crisis ? `${crisis.message} ${UNAVAILABLE_SPOKEN}` : UNAVAILABLE_SPOKEN, pause: true };
      }

      const reply = data.reply ?? { acknowledge: data.guidance, connection: '', step: '' };
      const crisis = data.crisis ?? null;
      const language = data.language ?? 'en';
      const status = data.status === 'no_strong_match' || data.status === 'conversation' ? data.status : 'answered';
      const replyId = data.replyId;

      setMessages((curr) => [
        ...withoutDraft(curr),
        { id, role: 'assistant', reply, verses: data.verses ?? [], crisis, language, status, replyId },
      ]);

      const spoken = speakableText(reply, crisis?.message, language);
      if (!streamed) {
        pushWordsToStream(spoken || data.guidance, true);
      }
      const remoteUrl = ttsUrl(replyId);
      return { speak: spoken, pause: Boolean(crisis), language, remoteUrl };
    } catch {
      setMessages((curr) => [...withoutDraft(curr), { id: uid(), role: 'error', text: UNAVAILABLE_TEXT, crisis: null }]);
      pushWordsToStream(UNAVAILABLE_TEXT, true);
      return { speak: UNAVAILABLE_SPOKEN, pause: true };
    } finally {
      setPending(null);
    }
  }

  const talk = useTalkMode(voice, dictation, sendMessage);

  /** Streams the initial greeting words in sync with voice audio, strictly within 2 lines */
  function startCompanion() {
    unlockAudio();
    setCallActive(true);
    const greetingObj = generatePersonalizedGreeting(profile, memories);
    pushWordsToStream(greetingObj.text, true);

    void withFace(() => {
      unlockAudio();
      const remoteUrl = !greetingObj.isPersonalized ? '/api/tts?greeting=1' : undefined;
      voice.speak('greeting', greetingObj.text, () => talk.begin(), greetingObj.language, remoteUrl);
    });
  }

  /** Immediately interrupts Krishna's voice, stops avatar lip-sync, and clears streaming subtitles */
  function stopKrishnaSpeaking() {
    voice.stop();
    avatarEngine().stop();
    if (streamIntervalRef.current) {
      window.clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
    }
    wordQueueRef.current = [];
    currentWindowRef.current = '';
    setIsStreaming(false);
  }

  function handleMicTap() {
    unlockAudio();
    if (!callActive) {
      startCompanion();
      return;
    }

    const isSpeaking = Boolean(voice.speakingId) || isStreaming || talk.state.mode === 'speaking';
    if (isSpeaking) {
      // Instant Barge-In: immediately interrupt Krishna and start listening to the devotee
      stopKrishnaSpeaking();
      talk.begin();
      return;
    }

    if (talk.state.mode === 'listening') {
      talk.interrupt();
    } else {
      talk.begin();
    }
  }

  function onSend(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || pending) return;
    unlockAudio();
    setCallActive(true);
    void sendMessage(text).then((turn) => {
      if (turn.speak && voice.supported) {
        unlockAudio();
        voice.speak('text-reply', turn.speak, undefined, turn.language, turn.remoteUrl);
      }
    });
  }

  const lastAssistant = [...messages].reverse().find((m): m is Extract<UiMessage, { role: 'assistant' }> => m.role === 'assistant');
  const citedVerse = lastAssistant && lastAssistant.verses.length > 0 ? lastAssistant.verses[0] : null;
  const lastCrisis = lastAssistant?.crisis;
  const currentMode = talk.state.mode;

  let statusText = 'Radhe Radhe, my friend';
  if (!callActive) {
    statusText = 'Krishna is present with you';
  } else if (currentMode === 'listening') {
    statusText = 'I am listening… speak freely';
  } else if (currentMode === 'thinking' || pending === 'send') {
    statusText = 'Krishna is reflecting on your words…';
  } else if (currentMode === 'speaking' || voice.speakingId) {
    statusText = 'Krishna is speaking…';
  } else if (currentMode === 'paused') {
    statusText = 'Paused · Tap mic to speak again';
  }

  return (
    <main
      className="sanctuary-stage-fullscreen"
      onClick={(e) => {
        if (!callActive && (e.target as HTMLElement).tagName !== 'BUTTON' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
          startCompanion();
        }
      }}
    >
      {/* 1. Full-Screen Avatar / Video Background */}
      <div className="sanctuary-avatar-bg">
        <KrishnaAvatar size="fullscreen" label="Krishna is arriving…" />
      </div>

      {/* 2. Soft Vignette Overlay */}
      <div className="sanctuary-scrim" aria-hidden="true" />

      {/* 3. Floating Top Quick Actions (Persona, Memories, Auth, History, Settings) */}
      <div className="sanctuary-top-controls">
        <div className="sanctuary-quick-actions">
          {/* Persona / Devotee Pill */}
          <button
            type="button"
            className="sanctuary-circle-action sanctuary-persona-chip"
            onClick={() => {
              setProfileDraft(profile);
              setPersonalizeOpen(true);
            }}
            title="Personalize Krishna Companion"
            aria-label="Personalize Krishna Companion"
          >
            <span className="persona-chip-icon">{PERSONA_DESCRIPTIONS[profile.persona ?? 'sakha'].icon}</span>
            <span className="persona-chip-text">
              {profile.preferredName ? profile.preferredName : PERSONA_DESCRIPTIONS[profile.persona ?? 'sakha'].label}
            </span>
          </button>

          {/* Companion Memory Pill (like ChatGPT Manage Memory) */}
          <button
            type="button"
            className="sanctuary-circle-action sanctuary-memory-chip"
            onClick={() => setMemoriesOpen(true)}
            title="What Krishna Remembers"
            aria-label="What Krishna Remembers"
          >
            <span>🧠</span>
            <span className="memory-chip-text">Memory</span>
            {memories.filter((m) => m.active).length > 0 ? (
              <span className="nav-count">{memories.filter((m) => m.active).length}</span>
            ) : null}
          </button>

          {/* Sign In / Account Sync Pill */}
          <button
            type="button"
            className={`sanctuary-circle-action sanctuary-auth-chip ${user ? 'sanctuary-auth-active' : ''}`}
            onClick={() => {
              setAuthNotice(null);
              setAuthOpen(true);
            }}
            title={user ? `Signed in as ${user.email ?? 'Devotee'}` : 'Sign in to sync across devices'}
            aria-label={user ? 'Account and Sync' : 'Sign In'}
          >
            <span>{user ? '👤' : '🔐'}</span>
            <span className="auth-chip-text">
              {user ? (user.email ? user.email.split('@')[0] : 'Account') : 'Sign In'}
            </span>
          </button>

          {messages.length > 0 ? (
            <button
              type="button"
              className="sanctuary-circle-action"
              onClick={() => setHistoryOpen(true)}
              title="Conversation History"
              aria-label="View conversation history"
            >
              <span>History</span>
              <span className="nav-count">{messages.length}</span>
            </button>
          ) : null}

          <button
            type="button"
            className="sanctuary-circle-action sanctuary-circle-icon-only"
            onClick={() => setSettingsOpen(true)}
            title="Voice Settings"
            aria-label="Voice settings"
          >
            <SlidersIcon />
          </button>
        </div>
      </div>

      {/* 4. Center Dialog & Streaming Captions (No Prebuilt Box) */}
      <div className="sanctuary-dialog-area">
        {/* Sacred Welcome Invitation / Live Companion Status Badge */}
        {!callActive ? (
          <button
            type="button"
            className="sanctuary-welcome-start-btn"
            onClick={startCompanion}
            aria-label="Speak with Krishna"
          >
            <Lotus className="welcome-lotus" />
            <span className="welcome-main-text">Speak with Krishna</span>
            <span className="welcome-subtext">Tap to hear Krishna’s voice</span>
          </button>
        ) : (
          <div className="sanctuary-status-pill" role="status">
            <span className={`status-dot status-dot-${currentMode !== 'off' ? currentMode : 'active'}`} />
            <span>{statusText}</span>
          </div>
        )}

        {/* Crisis Card Alert (if triggered) */}
        {lastCrisis ? (
          <aside className="crisis sanctuary-crisis" role="alert">
            <p className="crisis-message">{lastCrisis.message}</p>
            <ul className="crisis-lines">
              {lastCrisis.helplines.map((line) => (
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
        ) : null}

        {/* Small Reference Gita Chip */}
        {citedVerse && !verseDrawer ? (
          <button
            type="button"
            className="gita-ref-chip-sm"
            onClick={() => setVerseDrawer(citedVerse)}
            title={`View Gita ${citedVerse.chapter}.${citedVerse.verse}`}
            aria-label={`View cited verse chapter ${citedVerse.chapter} verse ${citedVerse.verse}`}
          >
            <Lotus className="gita-chip-icon" />
            <span>Gita {citedVerse.chapter}.{citedVerse.verse}</span>
          </button>
        ) : null}

        {/* Live Streaming Subtitles — Cinematic with No Static Container Box */}
        {caption ? (
          <div className="sanctuary-streaming-caption" aria-live="polite">
            <p className="sanctuary-caption-text">
              {caption}
              {isStreaming ? <span className="streaming-cursor" aria-hidden="true" /> : null}
            </p>
          </div>
        ) : !callActive ? (
          <div className="sanctuary-streaming-caption">
            <p className="sanctuary-caption-text sanctuary-caption-invitation">
              {profile.preferredName
                ? `Radhe Radhe, ${profile.preferredName}. I am right here with you.`
                : 'Radhe Radhe, my friend. I am right here with you.'}
            </p>
          </div>
        ) : null}
      </div>

      {/* 5. Senior-Designer Unified Conversational Input Bar */}
      <div className="sanctuary-input-bar-container">
        <form className="sanctuary-input-bar" onSubmit={onSend}>
          {/* Integrated Mic Button on the Left */}
          <button
            type="button"
            className={`bar-mic-btn ${currentMode === 'listening'
              ? 'bar-mic-listening'
              : currentMode === 'speaking' || Boolean(voice.speakingId)
                ? 'bar-mic-speaking'
                : ''
              }`}
            onClick={handleMicTap}
            title={
              currentMode === 'listening'
                ? 'Pause listening'
                : currentMode === 'speaking' || Boolean(voice.speakingId)
                  ? 'Tap to interrupt Krishna & speak'
                  : 'Speak aloud to Krishna'
            }
            aria-label="Voice input"
          >
            {currentMode === 'speaking' || Boolean(voice.speakingId) ? (
              <span className="bar-interrupt-icon" title="Tap to interrupt">⏹</span>
            ) : currentMode === 'thinking' ? (
              <div className="sanctuary-spin-loader-sm" />
            ) : (
              <MicIcon className="bar-icon" />
            )}
          </button>

          {/* Senior UI/UX Designer Auto-Expanding Text Area */}
          <textarea
            ref={textareaRef}
            rows={1}
            className="bar-textarea"
            placeholder={
              currentMode === 'listening'
                ? 'Listening to your voice… (speak freely)'
                : currentMode === 'thinking' || pending === 'send'
                  ? 'Krishna is reflecting on your words…'
                  : 'Share what is on your heart with Krishna…'
            }
            value={draft}
            maxLength={2000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={Boolean(pending)}
          />

          {/* Radiant Golden Send Button on the Right */}
          <button
            type="submit"
            className="bar-send-btn"
            disabled={!draft.trim() || Boolean(pending)}
            title="Send message"
            aria-label="Send message"
          >
            <SendIcon />
          </button>
        </form>
      </div>

      {/* Slide-Up Verse Drawer / Modal */}
      {verseDrawer ? (
        <div className="sanctuary-modal-backdrop" onClick={() => setVerseDrawer(null)}>
          <div className="sanctuary-modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-drag-indicator" aria-hidden="true">
              <span className="drag-pill" />
            </div>
            <header className="sanctuary-sheet-header">
              <span className="sanctuary-sheet-title">
                {verseDrawer === daily ? 'Verse of the Day' : `Bhagavad Gita ${verseDrawer.chapter}.${verseDrawer.verse}`}
              </span>
              <button
                type="button"
                className="sanctuary-close-btn"
                onClick={() => setVerseDrawer(null)}
                aria-label="Close verse"
              >
                <CloseIcon />
              </button>
            </header>
            <div className="sanctuary-sheet-body">
              <VerseCard
                verse={verseDrawer}
                label={verseDrawer === daily ? 'Today’s verse' : `Chapter ${verseDrawer.chapter} · Verse ${verseDrawer.verse}`}
                actions={actionsFor(verseDrawer)}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Slide-Over Conversation History Drawer */}
      {historyOpen ? (
        <div className="sanctuary-modal-backdrop" onClick={() => setHistoryOpen(false)}>
          <div className="sanctuary-history-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="modal-drag-indicator" aria-hidden="true">
              <span className="drag-pill" />
            </div>
            <header className="sanctuary-sheet-header">
              <span className="sanctuary-sheet-title">Conversation with Krishna</span>
              <button
                type="button"
                className="sanctuary-close-btn"
                onClick={() => setHistoryOpen(false)}
                aria-label="Close history"
              >
                <CloseIcon />
              </button>
            </header>
            <div className="sanctuary-history-list">
              {messages.map((msg) => (
                <div key={msg.id} className={`history-bubble history-bubble-${msg.role}`}>
                  <p className="history-sender">{msg.role === 'user' ? 'You' : 'Krishna'}</p>
                  <p className="history-text">
                    {msg.role === 'user'
                      ? msg.text
                      : msg.role === 'assistant'
                        ? [msg.reply.acknowledge, msg.reply.connection, msg.reply.step].filter(Boolean).join('\n\n')
                        : msg.text}
                  </p>
                  {msg.role === 'assistant' && msg.verses.length > 0 ? (
                    <button
                      type="button"
                      className="sanctuary-history-verse-link"
                      onClick={() => {
                        setHistoryOpen(false);
                        setVerseDrawer(msg.verses[0]);
                      }}
                    >
                      <Lotus className="sanctuary-pill-lotus" />
                      <span>View Verse {msg.verses[0].chapter}.{msg.verses[0].verse}</span>
                    </button>
                  ) : null}
                </div>
              ))}
              <div ref={endRef} />
            </div>
          </div>
        </div>
      ) : null}

      {/* Settings Modal */}
      {settingsOpen ? (
        <div className="sanctuary-modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="sanctuary-settings-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-drag-indicator" aria-hidden="true">
              <span className="drag-pill" />
            </div>
            <header className="sanctuary-sheet-header">
              <span className="sanctuary-sheet-title">Companion Settings</span>
              <button
                type="button"
                className="sanctuary-close-btn"
                onClick={() => setSettingsOpen(false)}
                aria-label="Close settings"
              >
                <CloseIcon />
              </button>
            </header>

            <div className="sanctuary-settings-body">
              <label className="settings-field">
                <span className="settings-label">Microphone Language</span>
                <select
                  className="select"
                  value={micLang}
                  onChange={(e) => {
                    setMicLang(e.target.value);
                    writePref(MIC_LANG_KEY, e.target.value);
                  }}
                >
                  {MIC_LANGS.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </label>

              {service.tts ? (
                <label className="toggle-row">
                  <span>Natural Spoken Voice (ElevenLabs)</span>
                  <input
                    type="checkbox"
                    checked={naturalPref}
                    onChange={(e) => {
                      setNaturalPref(e.target.checked);
                      writePref(NATURAL_KEY, e.target.checked ? '1' : '0');
                    }}
                  />
                </label>
              ) : null}

              {service.avatar ? (
                <label className="toggle-row">
                  <span>Interactive Video Face (Anam.ai)</span>
                  <input
                    type="checkbox"
                    checked={avatarPref}
                    onChange={(e) => {
                      setAvatarPref(e.target.checked);
                      writePref(AVATAR_KEY, e.target.checked ? '1' : '0');
                    }}
                  />
                </label>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* 8. Personalize Krishna Companion Modal */}
      {personalizeOpen ? (
        <div className="sanctuary-modal-backdrop" onClick={() => setPersonalizeOpen(false)}>
          <div className="sanctuary-modal-sheet sanctuary-personalize-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-drag-indicator" aria-hidden="true">
              <span className="drag-pill" />
            </div>
            <header className="sanctuary-sheet-header">
              <div className="personalize-title-group">
                <span className="sanctuary-sheet-title">Personalize Your Companion</span>
                <span className="personalize-subtitle">Choose how Krishna addresses and guides you</span>
              </div>
              <button
                type="button"
                className="sanctuary-close-btn"
                onClick={() => setPersonalizeOpen(false)}
                aria-label="Close personalization"
              >
                ✕
              </button>
            </header>

            <div className="personalize-body">
              {/* Devotee Preferred Name */}
              <div className="personalize-field">
                <label htmlFor="devotee-name" className="personalize-label">
                  What should Krishna call you?
                </label>
                <input
                  id="devotee-name"
                  type="text"
                  className="personalize-input"
                  placeholder="e.g. Mani, Arjun, Radha..."
                  maxLength={50}
                  value={profileDraft.preferredName ?? ''}
                  onChange={(e) => setProfileDraft((curr) => ({ ...curr, preferredName: e.target.value }))}
                />
              </div>

              {/* Persona Selector */}
              <div className="personalize-field">
                <span className="personalize-label">How should Krishna speak to you?</span>
                <div className="persona-cards-grid">
                  {(Object.keys(PERSONA_DESCRIPTIONS) as CompanionPersona[]).map((pKey) => {
                    const info = PERSONA_DESCRIPTIONS[pKey];
                    const selected = (profileDraft.persona || 'sakha') === pKey;
                    return (
                      <button
                        key={pKey}
                        type="button"
                        className={`persona-card ${selected ? 'persona-card-active' : ''}`}
                        onClick={() => setProfileDraft((curr) => ({ ...curr, persona: pKey }))}
                      >
                        <div className="persona-card-top">
                          <span className="persona-card-icon">{info.icon}</span>
                          <span className="persona-card-name">{info.label}</span>
                          {selected ? <span className="persona-check">✓</span> : null}
                        </div>
                        <span className="persona-card-title">{info.title}</span>
                        <p className="persona-card-summary">{info.summary}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Life Context / Main Focus */}
              <div className="personalize-field">
                <label htmlFor="devotee-context" className="personalize-label">
                  What is on your heart most these days? <span className="personalize-optional">(Optional)</span>
                </label>
                <div className="focus-quick-chips">
                  {[
                    'Peace of mind & calmness',
                    'Career & decision making',
                    'Overcoming doubt & fear',
                    'Duty & family relationships',
                    'Deepening devotion & surrender',
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      className={`focus-chip ${profileDraft.lifeContext === chip ? 'focus-chip-active' : ''}`}
                      onClick={() =>
                        setProfileDraft((curr) => ({
                          ...curr,
                          lifeContext: curr.lifeContext === chip ? '' : chip,
                        }))
                      }
                    >
                      {chip}
                    </button>
                  ))}
                </div>
                <input
                  id="devotee-context"
                  type="text"
                  className="personalize-input"
                  placeholder="Or write your own life context..."
                  maxLength={150}
                  value={profileDraft.lifeContext ?? ''}
                  onChange={(e) => setProfileDraft((curr) => ({ ...curr, lifeContext: e.target.value }))}
                />
              </div>

              {/* Actions */}
              <div className="personalize-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setPersonalizeOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    writeProfile(profileDraft);
                    setProfile(profileDraft);
                    setPersonalizeOpen(false);
                    flash('Companion preferences saved');
                  }}
                >
                  Save Profile
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* 9. "What Krishna Remembers" Modal (Conversational Memory like ChatGPT) */}
      {memoriesOpen ? (
        <div className="sanctuary-modal-backdrop" onClick={() => setMemoriesOpen(false)}>
          <div className="sanctuary-modal-sheet sanctuary-memories-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-drag-indicator" aria-hidden="true">
              <span className="drag-pill" />
            </div>
            <header className="sanctuary-sheet-header">
              <div className="personalize-title-group">
                <span className="sanctuary-sheet-title">What Krishna Remembers</span>
                <span className="personalize-subtitle">
                  Krishna learns from your conversations like a dear companion. You can edit or delete anything.
                </span>
              </div>
              <button
                type="button"
                className="sanctuary-close-btn"
                onClick={() => setMemoriesOpen(false)}
                aria-label="Close memories"
              >
                ✕
              </button>
            </header>

            <div className="memories-body">
              {/* Add Custom Memory Input */}
              <div className="memory-add-box">
                <span className="personalize-label">Add a detail you want Krishna to remember:</span>
                <div className="memory-add-row">
                  <select
                    className="select memory-category-select"
                    value={newMemoryCategory}
                    onChange={(e) => setNewMemoryCategory(e.target.value as MemoryCategory)}
                  >
                    <option value="life_context">👤 Life & Work</option>
                    <option value="struggle">🌧️ Dilemmas & Feelings</option>
                    <option value="commitment">🪷 Spiritual Practice</option>
                    <option value="milestone">🌟 Growth & Insight</option>
                  </select>
                  <input
                    type="text"
                    className="personalize-input memory-add-input"
                    placeholder="e.g. Preparing for exams, Caring for parents..."
                    value={newMemoryText}
                    maxLength={140}
                    onChange={(e) => setNewMemoryText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (newMemoryText.trim()) {
                          const updated = mergeMemories(memories, [
                            { fact: newMemoryText.trim(), category: newMemoryCategory },
                          ]);
                          writeMemories(updated);
                          setMemories(updated);
                          setNewMemoryText('');
                          flash('Memory added');
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary memory-add-btn"
                    disabled={!newMemoryText.trim()}
                    onClick={() => {
                      if (newMemoryText.trim()) {
                        const updated = mergeMemories(memories, [
                          { fact: newMemoryText.trim(), category: newMemoryCategory },
                        ]);
                        writeMemories(updated);
                        setMemories(updated);
                        setNewMemoryText('');
                        flash('Memory added');
                      }
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Memory List Header */}
              <div className="memories-list-header">
                <span className="memories-count-label">
                  Active Memories ({memories.filter((m) => m.active).length})
                </span>
                {memories.length > 0 ? (
                  <button
                    type="button"
                    className="memories-clear-btn"
                    onClick={() => {
                      if (window.confirm('Clear all memories Krishna has formed?')) {
                        writeMemories([]);
                        setMemories([]);
                        flash('All memories cleared');
                      }
                    }}
                  >
                    Clear All
                  </button>
                ) : null}
              </div>

              {memories.length === 0 ? (
                <div className="memories-empty">
                  <span className="memories-empty-icon">🪷</span>
                  <p className="memories-empty-title">Krishna hasn’t formed any memories yet</p>
                  <p className="memories-empty-sub">
                    As you share your thoughts, dilemmas, and feelings, Krishna will automatically remember what matters
                    most to walk beside you like a true friend.
                  </p>
                </div>
              ) : (
                <div className="memories-list">
                  {memories.map((mem) => {
                    const catInfo = MEMORY_CATEGORIES[mem.category] ?? MEMORY_CATEGORIES.struggle;
                    const isEditing = editingMemoryId === mem.id;

                    return (
                      <div key={mem.id} className="memory-card">
                        <div className="memory-card-header">
                          <span className="memory-badge">
                            <span>{catInfo.icon}</span>
                            <span>{catInfo.label}</span>
                          </span>
                          {mem.associatedVerse ? (
                            <span className="memory-verse-tag">Gita {mem.associatedVerse}</span>
                          ) : null}
                          <div className="memory-card-actions">
                            {isEditing ? (
                              <button
                                type="button"
                                className="memory-btn-text"
                                onClick={() => {
                                  if (editingText.trim()) {
                                    const next = memories.map((m) =>
                                      m.id === mem.id ? { ...m, fact: editingText.trim() } : m,
                                    );
                                    writeMemories(next);
                                    setMemories(next);
                                    setEditingMemoryId(null);
                                    flash('Memory updated');
                                  }
                                }}
                              >
                                Save
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="memory-btn-icon"
                                title="Edit memory"
                                onClick={() => {
                                  setEditingMemoryId(mem.id);
                                  setEditingText(mem.fact);
                                }}
                              >
                                ✏️
                              </button>
                            )}
                            <button
                              type="button"
                              className="memory-btn-icon memory-btn-delete"
                              title="Delete memory"
                              onClick={() => {
                                const next = memories.filter((m) => m.id !== mem.id);
                                writeMemories(next);
                                setMemories(next);
                                flash('Memory removed');
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        {isEditing ? (
                          <input
                            type="text"
                            className="personalize-input memory-edit-input"
                            value={editingText}
                            maxLength={150}
                            onChange={(e) => setEditingText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const next = memories.map((m) =>
                                  m.id === mem.id ? { ...m, fact: editingText.trim() } : m,
                                );
                                writeMemories(next);
                                setMemories(next);
                                setEditingMemoryId(null);
                                flash('Memory updated');
                              }
                            }}
                          />
                        ) : (
                          <p className="memory-fact-text">{mem.fact}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* 10. Sacred Sign In & Cloud Sync Modal */}
      {authOpen ? (
        <div className="sanctuary-modal-backdrop" onClick={() => setAuthOpen(false)}>
          <div className="sanctuary-modal-sheet sanctuary-auth-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-drag-indicator" aria-hidden="true">
              <span className="drag-pill" />
            </div>
            <header className="sanctuary-sheet-header">
              <div className="personalize-title-group">
                <span className="sanctuary-sheet-title">
                  {user ? 'Your Account & Cloud Sync' : 'Walk with Krishna Across Your Devices'}
                </span>
                <span className="personalize-subtitle">
                  {user
                    ? 'Your personal memories and saved verses are backed up in the cloud'
                    : 'Sign in to access your companion reflections and memories anywhere'}
                </span>
              </div>
              <button
                type="button"
                className="sanctuary-close-btn"
                onClick={() => setAuthOpen(false)}
                aria-label="Close account modal"
              >
                ✕
              </button>
            </header>

            <div className="auth-body">
              {authNotice ? (
                <div className="auth-notice-banner" role="alert">
                  {authNotice}
                </div>
              ) : null}

              {user ? (
                /* Signed-in Account Details */
                <div className="auth-signed-in-card">
                  <div className="auth-user-info">
                    <span className="auth-avatar-circle">
                      {user.email ? user.email.charAt(0).toUpperCase() : 'U'}
                    </span>
                    <div>
                      <p className="auth-user-email">{user.email}</p>
                      <span className="auth-sync-status">🟢 Cloud sync active</span>
                    </div>
                  </div>

                  <div className="auth-sync-actions">
                    <button
                      type="button"
                      className="btn btn-secondary auth-btn-sync"
                      disabled={authPending}
                      onClick={async () => {
                        setAuthPending(true);
                        try {
                          await migrateGuestDataToCloud(user.id);
                          await pullCloudUserData(user.id);
                          flash('Data synced with cloud successfully');
                        } catch {
                          flash('Sync failed. Please check internet connection.');
                        } finally {
                          setAuthPending(false);
                        }
                      }}
                    >
                      {authPending ? 'Syncing…' : '🔄 Sync Now'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary auth-btn-signout"
                      onClick={async () => {
                        await signOut();
                        setUser(null);
                        setAuthOpen(false);
                        flash('Signed out successfully');
                      }}
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              ) : (
                /* Sign In / Sign Up Form */
                <div className="auth-signin-container">
                  {/* Notice of Guest Data Preservation */}
                  <div className="auth-preservation-pill">
                    <span>🕊️</span>
                    <span>Your guest memories, profile, and saved verses will be preserved upon sign in.</span>
                  </div>

                  {/* Google OAuth Button */}
                  <button
                    type="button"
                    className="auth-google-btn"
                    disabled={authPending}
                    onClick={async () => {
                      if (!isSupabaseConfigured()) {
                        setAuthNotice('Supabase credentials needed in .env.local (schema is ready in supabase/schema.sql)');
                        return;
                      }
                      setAuthPending(true);
                      const { error } = await signInWithGoogle();
                      if (error) {
                        setAuthNotice(error.message);
                        setAuthPending(false);
                      }
                    }}
                  >
                    <svg className="google-svg" viewBox="0 0 24 24" width="18" height="18">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>Continue with Google</span>
                  </button>

                  <div className="auth-divider">
                    <span className="auth-divider-line" />
                    <span className="auth-divider-text">or with email link</span>
                    <span className="auth-divider-line" />
                  </div>

                  {/* Magic Link Form */}
                  <form
                    className="auth-email-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!isSupabaseConfigured()) {
                        setAuthNotice('Supabase credentials needed in .env.local (schema is ready in supabase/schema.sql)');
                        return;
                      }
                      if (!authEmail.trim()) return;
                      setAuthPending(true);
                      setAuthNotice(null);
                      const { error } = await signInWithEmail(authEmail);
                      setAuthPending(false);
                      if (error) {
                        setAuthNotice(error.message);
                      } else {
                        setAuthNotice(`Check your email inbox! A sacred sign-in link was sent to ${authEmail}.`);
                        setAuthEmail('');
                      }
                    }}
                  >
                    <input
                      type="email"
                      className="personalize-input auth-email-input"
                      placeholder="Enter your email address…"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      required
                    />
                    <button
                      type="submit"
                      className="btn btn-primary auth-submit-btn"
                      disabled={authPending || !authEmail.trim()}
                    >
                      {authPending ? 'Sending…' : 'Send Sign-In Link'}
                    </button>
                  </form>

                  {!isSupabaseConfigured() ? (
                    <div className="auth-setup-banner">
                      <p className="auth-setup-title">⚙️ Cloud Sync Ready</p>
                      <p className="auth-setup-desc">
                        To enable live Supabase authentication, simply add your <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to <code>.env.local</code>. Database schema is generated in <code>supabase/schema.sql</code>.
                      </p>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Floating Flash Toast */}
      {notice ? (
        <div className="toast" role="status">
          {notice}
        </div>
      ) : null}
    </main>
  );
}
