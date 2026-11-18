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
  cleanAuthUrlHash,
  getCurrentUser,
  getSupabase,
  isSupabaseConfigured,
  signInWithEmail,
  signInWithGoogle,
  signOut,
} from '@/lib/supabase';
import {
  migrateGuestDataToCloud,
  pullCloudUserData,
  syncUserData,
  isAutoSyncEnabled,
  setAutoSyncEnabled,
  getLastSyncedAt,
  formatLastSynced,
} from '@/lib/sync';
import { speakableText } from '@/lib/speech';
import { useBargeIn, BARGE_IN_PREF_KEY } from './use-barge-in';
import { avatarEngine } from './avatar/anam-engine';
import { KrishnaAvatar, useAvatarState } from './avatar/krishna-avatar';
import {
  CloseIcon,
  Lotus,
  MicIcon,
  SendIcon,
  VolumeIcon,
} from './icons';
import { useSavedVerses, verseRef, SAVED_EVENT } from './saved';
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
  { code: 'hi-IN', label: 'Hindi (हिंदी)' },
  { code: 'ta-IN', label: 'Tamil (தமிழ்)' },
  { code: 'te-IN', label: 'Telugu (తెలుగు)' },
  { code: 'kn-IN', label: 'Kannada (ಕನ್ನಡ)' },
  { code: 'ml-IN', label: 'Malayalam (മലയാളം)' },
  { code: 'mr-IN', label: 'Marathi (मराठी)' },
  { code: 'bn-IN', label: 'Bengali (বাংলা)' },
  { code: 'gu-IN', label: 'Gujarati (ગુજરાતી)' },
  { code: 'pa-IN', label: 'Punjabi (ਪੰਜਾਬੀ)' },
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

function getDevoteeDisplayName(profile: DevoteeProfile, user: User | null): string {
  if (profile.preferredName?.trim()) {
    return profile.preferredName.trim();
  }
  const metaName = user?.user_metadata?.full_name || user?.user_metadata?.name;
  if (typeof metaName === 'string' && metaName.trim()) {
    return metaName.trim();
  }
  if (user?.email) {
    const raw = user.email.split('@')[0];
    const lettersOnly = raw.replace(/[0-9_.-]/g, '');
    if (lettersOnly.length >= 2) {
      return lettersOnly.charAt(0).toUpperCase() + lettersOnly.slice(1);
    }
    return raw;
  }
  return 'Devotee';
}

export function SanctuaryScreen({ daily }: { daily: DisplayVerse | null }) {
  const [sessionId] = useState(() => uid());
  const [callActive, setCallActive] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [autoSync, setAutoSync] = useState(() => isAutoSyncEnabled());
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [lastSyncedAt, setLastSyncedAtState] = useState<number | null>(() => getLastSyncedAt());
  const autoSyncDebounceRef = useRef<number | null>(null);
  const lastFocusSyncRef = useRef<number>(0);
  const [profile, setProfile] = useState<DevoteeProfile>(defaultProfile);
  const [memories, setMemories] = useState<CompanionMemory[]>([]);
  const [verseDrawer, setVerseDrawer] = useState<DisplayVerse | null>(null);
  const [draft, setDraft] = useState('');
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
  const [bargeInPref, setBargeInPref] = useState(true);
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

  function flash(_text: string) {
    // Screen toast removed
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

    const loadedMemories = readMemories();
    setMemories(loadedMemories);

    const onProfileChange = () => {
      const refreshed = readProfile();
      setProfile(refreshed);
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
        setSyncStatus('syncing');
        void syncUserData(u.id)
          .then((res) => {
            if (res.success) {
              setSyncStatus('synced');
              setLastSyncedAtState(Date.now());
            } else {
              setSyncStatus('error');
            }
          })
          .catch(() => setSyncStatus('error'));
      }
      cleanAuthUrlHash();
    });

    const sb = getSupabase();
    const authSubscription = sb?.auth.onAuthStateChange(async (event, session) => {
      const authUser = session?.user ?? null;
      setUser(authUser);
      if (authUser && (event === 'SIGNED_IN' || event === 'USER_UPDATED')) {
        setSyncStatus('syncing');
        const res = await syncUserData(authUser.id);
        if (res.success) {
          setSyncStatus('synced');
          setLastSyncedAtState(Date.now());
        } else {
          setSyncStatus('error');
        }
      }
      cleanAuthUrlHash();
    });

    // Fallback cleanup timer in case of redirect errors or unhandled fragments
    const hashCleanTimer = window.setTimeout(cleanAuthUrlHash, 600);

    setNaturalPref(readPref(NATURAL_KEY) !== '0');
    setAvatarPref(readPref(AVATAR_KEY) !== '0');
    setBargeInPref(readPref(BARGE_IN_PREF_KEY) !== '0');
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
      window.clearTimeout(hashCleanTimer);
      authSubscription?.data?.subscription?.unsubscribe();
      if (streamIntervalRef.current) {
        window.clearInterval(streamIntervalRef.current);
        streamIntervalRef.current = null;
      }
    };
  }, []);

  // Background Auto-Sync: automatically pushes changes & pulls on window refocus
  useEffect(() => {
    if (!user || !autoSync) return;

    const triggerAutoSync = () => {
      if (autoSyncDebounceRef.current) {
        window.clearTimeout(autoSyncDebounceRef.current);
      }
      autoSyncDebounceRef.current = window.setTimeout(async () => {
        if (!user) return;
        setSyncStatus('syncing');
        try {
          const res = await syncUserData(user.id);
          if (res.success) {
            setSyncStatus('synced');
            setLastSyncedAtState(Date.now());
          } else {
            setSyncStatus('error');
          }
        } catch {
          setSyncStatus('error');
        }
      }, 1500);
    };

    const onDataMutation = () => {
      triggerAutoSync();
    };

    const onWindowFocus = () => {
      const now = Date.now();
      // Throttle window focus sync to at most once per 30 seconds
      if (now - lastFocusSyncRef.current < 30000) return;
      lastFocusSyncRef.current = now;
      void pullCloudUserData(user.id)
        .then(() => {
          setLastSyncedAtState(Date.now());
          setSyncStatus('synced');
        })
        .catch(() => {
          // Keep current status if offline
        });
    };

    const onNetworkOnline = () => {
      triggerAutoSync();
    };

    window.addEventListener(PROFILE_EVENT, onDataMutation);
    window.addEventListener(MEMORIES_EVENT, onDataMutation);
    window.addEventListener(SAVED_EVENT, onDataMutation);
    window.addEventListener('focus', onWindowFocus);
    window.addEventListener('online', onNetworkOnline);

    return () => {
      if (autoSyncDebounceRef.current) {
        window.clearTimeout(autoSyncDebounceRef.current);
      }
      window.removeEventListener(PROFILE_EVENT, onDataMutation);
      window.removeEventListener(MEMORIES_EVENT, onDataMutation);
      window.removeEventListener(SAVED_EVENT, onDataMutation);
      window.removeEventListener('focus', onWindowFocus);
      window.removeEventListener('online', onNetworkOnline);
    };
  }, [user, autoSync]);

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
    setIsStreaming(false);
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

  const isSpeaking = Boolean(voice.speakingId) || talk.state.mode === 'speaking';

  // Hands-Free Voice Barge-In (ChatGPT Advanced Voice Mode style):
  // Listens via Acoustic Echo Cancellation (AEC) while Krishna speaks.
  // When the devotee speaks aloud, automatically cuts Krishna off and starts listening!
  useBargeIn({
    enabled: bargeInPref,
    isSpeaking,
    onBargeIn: () => {
      stopKrishnaSpeaking();
      talk.interrupt();
      flash('I hear you… listening');
    },
  });

  function handleMicTap() {
    unlockAudio();
    if (!callActive) {
      startCompanion();
      return;
    }

    if (isSpeaking) {
      // Instant Barge-In: immediately interrupt Krishna and start listening to the devotee
      stopKrishnaSpeaking();
      talk.interrupt();
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

      {/* 3. Conversation History Floating Action (only when messages exist) */}
      {messages.length > 0 ? (
        <div className="sanctuary-history-container">
          <button
            type="button"
            className="sanctuary-circle-action sanctuary-history-btn"
            onClick={() => setHistoryOpen(true)}
            title="Conversation History"
            aria-label="View conversation history"
          >
            <span>📜 History</span>
            <span className="nav-count">{messages.length}</span>
          </button>
        </div>
      ) : null}

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
    </main>
  );
}
