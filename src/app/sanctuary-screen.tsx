'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
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
import {
  type DialogueMessage,
  type DialogueSession,
  loadDialogues,
  saveDialogue,
  deleteDialogue,
  generateDialogueTitle,
  formatDialogueDate,
  DIALOGUES_EVENT,
} from '@/lib/dialogue-history';
import { useAmbientSound } from '@/lib/ambient-sound';
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
  | { id: string; role: 'user'; text: string; timestamp?: number }
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
    timestamp?: number;
  }
  | { id: string; role: 'error'; text: string; crisis: Crisis; timestamp?: number };

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
  const [sessionId, setSessionId] = useState(() => uid());
  const sessionCreatedAtRef = useRef<number>(Date.now());
  const [callActive, setCallActive] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyView, setHistoryView] = useState<'directory' | 'transcript'>('directory');
  const [selectedDialogue, setSelectedDialogue] = useState<DialogueSession | null>(null);
  const [pastDialogues, setPastDialogues] = useState<DialogueSession[]>(() => {
    if (typeof window === 'undefined') return [];
    return loadDialogues();
  });
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
  const [isStitching, setIsStitching] = useState(false);
  const inFlightAbortRef = useRef<AbortController | null>(null);
  const lastUserMsgIdRef = useRef<string | null>(null);
  const ambient = useAmbientSound();

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
      hasSpeech: recorder.hasSpeech,
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

  // Sync past dialogues from local storage whenever dialogues change
  useEffect(() => {
    const refresh = () => {
      const all = loadDialogues();
      setPastDialogues(all.filter((s) => s.id !== sessionId));
    };
    refresh();
    window.addEventListener(DIALOGUES_EVENT, refresh);
    return () => window.removeEventListener(DIALOGUES_EVENT, refresh);
  }, [sessionId]);

  // Listen for global navbar History open trigger
  useEffect(() => {
    const onOpenGlobalHistory = () => {
      if (messages.length > 0 && pastDialogues.length === 0) {
        setSelectedDialogue(null);
        setHistoryView('transcript');
      } else {
        setHistoryView('directory');
      }
      setHistoryOpen(true);
    };
    window.addEventListener('gita-open-history', onOpenGlobalHistory);
    return () => window.removeEventListener('gita-open-history', onOpenGlobalHistory);
  }, [messages.length, pastDialogues.length]);

  // Handle URL param ?history=1 (e.g. navigated from another page's navbar)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.get('history') === '1') {
        setHistoryView('directory');
        setHistoryOpen(true);
        url.searchParams.delete('history');
        window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
      }
    }
  }, []);

  // Prevent topbar overlap by hiding it when modal or drawer is open
  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (historyOpen || verseDrawer) {
        document.body.classList.add('modal-drawer-open');
      } else {
        document.body.classList.remove('modal-drawer-open');
      }
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.body.classList.remove('modal-drawer-open');
      }
    };
  }, [historyOpen, verseDrawer]);

  // Auto-persist active sanctuary dialogue to local storage
  useEffect(() => {
    if (messages.length === 0) return;
    const nonStreaming = messages.filter((m) => !('streaming' in m && m.streaming));
    if (nonStreaming.length === 0) return;

    const dialogueMessages: DialogueMessage[] = nonStreaming.map((m) => {
      if (m.role === 'user') {
        return {
          id: m.id,
          role: 'user',
          text: m.text,
          timestamp: m.timestamp || Date.now(),
        };
      }
      if (m.role === 'assistant') {
        return {
          id: m.id,
          role: 'assistant',
          text: [m.reply.acknowledge, m.reply.connection, m.reply.step].filter(Boolean).join('\n\n'),
          reply: m.reply,
          verses: m.verses,
          language: m.language,
          timestamp: m.timestamp || Date.now(),
        };
      }
      return {
        id: m.id,
        role: 'error',
        text: m.text,
        timestamp: m.timestamp || Date.now(),
      };
    });

    const citedVerses: string[] = [];
    nonStreaming.forEach((m) => {
      if (m.role === 'assistant' && m.verses) {
        m.verses.forEach((v) => {
          const ref = `${v.chapter}.${v.verse}`;
          if (!citedVerses.includes(ref)) citedVerses.push(ref);
        });
      }
    });

    const session: DialogueSession = {
      id: sessionId,
      title: generateDialogueTitle(dialogueMessages),
      createdAt: sessionCreatedAtRef.current,
      updatedAt: Date.now(),
      messages: dialogueMessages,
      citedVerses,
    };

    saveDialogue(session);
  }, [messages, sessionId]);

  const activeCitedVerses = useMemo(() => {
    const list: string[] = [];
    messages.forEach((m) => {
      if (m.role === 'assistant' && m.verses) {
        m.verses.forEach((v) => {
          const ref = `${v.chapter}.${v.verse}`;
          if (!list.includes(ref)) list.push(ref);
        });
      }
    });
    return list;
  }, [messages]);

  function startNewDialogue() {
    voice.stop();
    talk.end();
    setMessages([]);
    const newId = uid();
    setSessionId(newId);
    sessionCreatedAtRef.current = Date.now();
    setSelectedDialogue(null);
    setHistoryView('directory');
    setCaption('');
    setIsStreaming(false);
    setDraft('');
    setHistoryOpen(false);
    flash('New dialogue started in the sanctuary');
  }

  function handleDeleteDialogue(id: string) {
    deleteDialogue(id);
    if (selectedDialogue?.id === id) {
      setSelectedDialogue(null);
      setHistoryView('directory');
    }
    flash('Dialogue removed from history');
  }

  function handleReplayVoice(msgId: string, text: string, language = 'en', replyId?: string) {
    if (voice.speakingId === msgId) {
      voice.stop();
      return;
    }
    const remoteUrl = replyId ? ttsUrl(replyId) : undefined;
    voice.speak(msgId, text, undefined, language, remoteUrl);
  }

  function handleCopyKrishnaText(text: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard
        .writeText(text)
        .then(() => flash("Krishna's words copied to clipboard"))
        .catch(() => flash('Could not copy to clipboard'));
    }
  }

  function formatMessageTime(timestamp?: number): string {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

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

  async function sendMessage(text: string, isStitch = false): Promise<TalkTurn> {
    const message = text.trim();
    if (!message) return { speak: '', pause: true };
    setPending('send');
    setDraft('');
    wordQueueRef.current = [];
    currentWindowRef.current = '';
    setCaption('');
    setIsStreaming(false);

    // Cleanly cancel any previous in-flight request before sending a new or stitched thought
    inFlightAbortRef.current?.abort();
    const controller = new AbortController();
    inFlightAbortRef.current = controller;

    if (isStitch && lastUserMsgIdRef.current) {
      // Thought Stitching: seamlessly update existing devotee bubble without fragments
      setMessages((curr) =>
        curr.map((item) => (item.id === lastUserMsgIdRef.current ? { ...item, text: message } : item))
      );
    } else {
      const userMsgId = uid();
      lastUserMsgIdRef.current = userMsgId;
      setMessages((curr) => [...curr, { id: userMsgId, role: 'user', text: message, timestamp: Date.now() }]);
    }

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
            timestamp: Date.now(),
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
      if (controller.signal.aborted) return;
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
        signal: controller.signal,
      });

      if (controller.signal.aborted) {
        setMessages((curr) => withoutDraft(curr));
        return { speak: '', pause: true, aborted: true };
      }

      const streamed = response.ok && response.body && (response.headers.get('content-type') ?? '').includes('ndjson');
      const data = streamed ? await readStream(response.body!, onEvent) : ((await response.json()) as ChatResponse);

      if (controller.signal.aborted) {
        setMessages((curr) => withoutDraft(curr));
        return { speak: '', pause: true, aborted: true };
      }

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
          { id: uid(), role: 'error', text: fallbackText, crisis, timestamp: Date.now() },
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
        { id, role: 'assistant', reply, verses: data.verses ?? [], crisis, language, status, replyId, timestamp: Date.now() },
      ]);

      const spoken = speakableText(reply, crisis?.message, language);
      if (!streamed) {
        pushWordsToStream(spoken || data.guidance, true);
      }
      const remoteUrl = ttsUrl(replyId);
      setIsStitching(false);
      return { speak: spoken, pause: Boolean(crisis), language, remoteUrl };
    } catch (err) {
      if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
        setMessages((curr) => withoutDraft(curr));
        return { speak: '', pause: true, aborted: true };
      }
      setMessages((curr) => [...withoutDraft(curr), { id: uid(), role: 'error', text: UNAVAILABLE_TEXT, crisis: null, timestamp: Date.now() }]);
      pushWordsToStream(UNAVAILABLE_TEXT, true);
      return { speak: UNAVAILABLE_SPOKEN, pause: true };
    } finally {
      if (inFlightAbortRef.current === controller) {
        setPending(null);
      }
    }
  }

  const talk = useTalkMode(voice, dictation, sendMessage, {
    onStitch: () => {
      setIsStitching(true);
    },
  });

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
    setIsStitching(false);
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

  // Play ambient flute and tanpura soundscape on mount / first user interaction
  useEffect(() => {
    if (ambient.enabled) {
      ambient.play();
    }
    const onFirstInteraction = () => {
      if (ambient.enabled) {
        ambient.play();
      }
    };
    window.addEventListener('pointerdown', onFirstInteraction, { once: true });
    window.addEventListener('keydown', onFirstInteraction, { once: true });
    return () => {
      window.removeEventListener('pointerdown', onFirstInteraction);
      window.removeEventListener('keydown', onFirstInteraction);
    };
  }, [ambient.enabled, ambient]);

  // Automatically duck ambient sound when Krishna is speaking so dialogue is pristine
  useEffect(() => {
    ambient.duck(isSpeaking);
  }, [isSpeaking, ambient]);

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
  } else if (isStitching) {
    statusText = 'Connecting your thought…';
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

      {/* Sacred Top HUD Controls (Ambient Soundscape Chip) */}
      <div className="sanctuary-top-hud">
        <button
          type="button"
          className={`sanctuary-ambient-chip ${ambient.enabled ? 'sanctuary-ambient-active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            ambient.toggle();
          }}
          title={
            ambient.enabled
              ? `${ambient.isFallback ? 'Default Sanctuary Ambient' : 'Krishna Flute & Bhakti Music'} · Click to Pause`
              : 'Ambient Music Paused · Click to Play'
          }
          aria-label={ambient.enabled ? 'Pause sacred ambient sound' : 'Play sacred ambient sound'}
        >
          <span className="ambient-chip-icon" aria-hidden="true">
            {ambient.enabled ? '🪈' : '🔇'}
          </span>
          <span className="ambient-chip-text">
            {ambient.enabled
              ? ambient.isFallback
                ? 'Sacred Ambient'
                : 'Krishna Flute'
              : 'Music Muted'}
          </span>
        </button>
      </div>

      {/* 3. Center Dialog & Streaming Captions (No Prebuilt Box) */}
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
        <div className="sanctuary-modal-backdrop sanctuary-modal-backdrop-verse" onClick={() => setVerseDrawer(null)}>
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

            <header className="sanctuary-sheet-header history-sheet-header">
              <div className="history-header-left">
                {historyView === 'transcript' && (pastDialogues.length > 0 || messages.length > 0) ? (
                  <button
                    type="button"
                    className="history-back-btn"
                    onClick={() => {
                      setHistoryView('directory');
                      setSelectedDialogue(null);
                    }}
                    aria-label="Back to all dialogues"
                  >
                    <span>← All Dialogues</span>
                  </button>
                ) : (
                  <span className="sanctuary-sheet-title">📜 Sacred Dialogues</span>
                )}
              </div>
              <div className="history-header-right">
                <button
                  type="button"
                  className="history-new-btn"
                  onClick={startNewDialogue}
                  title="Start a fresh dialogue in the sanctuary"
                >
                  <span>+ New</span>
                </button>
                <button
                  type="button"
                  className="sanctuary-close-btn"
                  onClick={() => setHistoryOpen(false)}
                  aria-label="Close history"
                >
                  <CloseIcon />
                </button>
              </div>
            </header>

            {historyView === 'directory' ? (
              <div className="history-directory-container">
                {/* 1. CURRENT SANCTUARY DIALOGUE */}
                <section className="history-section">
                  <h3 className="history-section-kicker">Current Sanctuary</h3>
                  {messages.length > 0 ? (
                    <div
                      className="history-chapter-card history-chapter-active"
                      onClick={() => {
                        setSelectedDialogue(null);
                        setHistoryView('transcript');
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="chapter-card-top">
                        <span className="chapter-live-badge">● Active Dialogue</span>
                        <span className="chapter-time">Now</span>
                      </div>
                      <h4 className="chapter-card-title">
                        {generateDialogueTitle(
                          messages.map((m) => ({
                            id: m.id,
                            role: m.role,
                            text:
                              m.role === 'user'
                                ? m.text
                                : m.role === 'assistant'
                                ? [m.reply.acknowledge, m.reply.connection, m.reply.step].filter(Boolean).join(' ')
                                : m.text,
                            verses: m.role === 'assistant' ? m.verses : undefined,
                            timestamp: m.timestamp || Date.now(),
                          })),
                        )}
                      </h4>
                      <div className="chapter-card-meta">
                        <span className="chapter-meta-exchanges">
                          {messages.filter((m) => m.role === 'user').length} exchanges
                        </span>
                        {activeCitedVerses.map((ref) => (
                          <span key={ref} className="chapter-verse-tag">
                            📖 Gita {ref}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="history-empty-active">
                      <p>No active dialogue in the sanctuary right now.</p>
                      <p className="history-empty-sub">Speak or type with Krishna to begin your dialogue.</p>
                    </div>
                  )}
                </section>

                {/* 2. PAST DIALOGUES DIRECTORY */}
                <section className="history-section">
                  <div className="history-section-header">
                    <h3 className="history-section-kicker">Past Dialogues</h3>
                    {pastDialogues.length > 0 ? (
                      <span className="history-count-tag">{pastDialogues.length} saved</span>
                    ) : null}
                  </div>

                  {pastDialogues.length === 0 ? (
                    <div className="history-empty-past">
                      <p>No past dialogues archived yet.</p>
                      <p className="history-empty-sub">
                        When you start a fresh dialogue, your previous conversations are peacefully archived here.
                      </p>
                    </div>
                  ) : (
                    <div className="history-chapters-list">
                      {pastDialogues.map((session) => (
                        <div
                          key={session.id}
                          className="history-chapter-card"
                          onClick={() => {
                            setSelectedDialogue(session);
                            setHistoryView('transcript');
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="chapter-card-top">
                            <span className="chapter-date">{formatDialogueDate(session.updatedAt)}</span>
                            <button
                              type="button"
                              className="chapter-delete-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteDialogue(session.id);
                              }}
                              title="Delete this dialogue"
                              aria-label="Delete dialogue"
                            >
                              ✕
                            </button>
                          </div>
                          <h4 className="chapter-card-title">{session.title}</h4>
                          <div className="chapter-card-meta">
                            <span className="chapter-meta-exchanges">
                              {session.messages.filter((m) => m.role === 'user').length} exchanges
                            </span>
                            {session.citedVerses?.map((ref) => (
                              <span key={ref} className="chapter-verse-tag">
                                📖 Gita {ref}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            ) : (
              /* TRANSCRIPT READING VIEW */
              <div className="sanctuary-history-transcript-wrap">
                <div className="transcript-header-banner">
                  <h4 className="transcript-dialogue-title">
                    {selectedDialogue
                      ? selectedDialogue.title
                      : generateDialogueTitle(
                          messages.map((m) => ({
                            id: m.id,
                            role: m.role,
                            text:
                              m.role === 'user'
                                ? m.text
                                : m.role === 'assistant'
                                ? [m.reply.acknowledge, m.reply.connection, m.reply.step].filter(Boolean).join(' ')
                                : m.text,
                            verses: m.role === 'assistant' ? m.verses : undefined,
                            timestamp: m.timestamp || Date.now(),
                          })),
                        )}
                  </h4>
                  <p className="transcript-dialogue-meta">
                    {selectedDialogue
                      ? `${formatDialogueDate(selectedDialogue.updatedAt)} · Walking with Krishna (${profile.persona})`
                      : `Active Sanctuary · Walking with Krishna (${profile.persona})`}
                  </p>
                </div>

                <div className="sanctuary-history-list">
                  {(() => {
                    const displayed = selectedDialogue
                      ? selectedDialogue.messages
                      : messages.filter((m) => !('streaming' in m && m.streaming));

                    if (displayed.length === 0) {
                      return (
                        <div className="history-empty-past">
                          <p>No messages in this dialogue yet.</p>
                        </div>
                      );
                    }

                    return displayed.map((msg) => {
                      const timeStr = msg.timestamp ? formatMessageTime(msg.timestamp) : '';

                      if (msg.role === 'user') {
                        return (
                          <div key={msg.id} className="history-bubble history-bubble-user">
                            <div className="history-bubble-header">
                              <span className="history-sender">👤 You</span>
                              {timeStr ? <span className="history-msg-time">{timeStr}</span> : null}
                            </div>
                            <p className="history-text">{msg.text}</p>
                          </div>
                        );
                      }

                      if (msg.role === 'assistant') {
                        const replyObj = 'reply' in msg && msg.reply ? msg.reply : null;
                        const rawText = 'text' in msg && typeof msg.text === 'string' ? msg.text : '';
                        const fullText = replyObj
                          ? [replyObj.acknowledge, replyObj.connection, replyObj.step].filter(Boolean).join('\n\n')
                          : rawText;
                        const spokenText = replyObj
                          ? speakableText(replyObj, undefined, msg.language)
                          : rawText;
                        const firstVerse = msg.verses && msg.verses.length > 0 ? msg.verses[0] : null;
                        const isSpeaking = voice.speakingId === msg.id;
                        const replyId = 'replyId' in msg ? msg.replyId : undefined;

                        return (
                          <div key={msg.id} className="history-bubble history-bubble-assistant">
                            <div className="history-bubble-header">
                              <div className="history-sender-group">
                                <span className="history-sender-icon">🌸</span>
                                <span className="history-sender">Krishna</span>
                                <span className="history-persona-tag">({profile.persona})</span>
                              </div>
                              {timeStr ? <span className="history-msg-time">{timeStr}</span> : null}
                            </div>

                            <div className="history-text history-three-part">
                              {replyObj?.acknowledge ? (
                                <p className="history-part-acknowledge">{replyObj.acknowledge}</p>
                              ) : null}
                              {replyObj?.connection ? (
                                <p className="history-part-connection">{replyObj.connection}</p>
                              ) : null}
                              {replyObj?.step ? (
                                <p className="history-part-step">{replyObj.step}</p>
                              ) : null}
                              {!replyObj && fullText ? <p>{fullText}</p> : null}
                            </div>

                            {msg.verses && msg.verses.length > 0 ? (
                              <div className="history-bubble-verses">
                                {msg.verses.map((v) => (
                                  <button
                                    key={verseRef(v)}
                                    type="button"
                                    className="sanctuary-history-verse-link"
                                    onClick={() => setVerseDrawer(v)}
                                    title={`View Bhagavad Gita ${v.chapter}.${v.verse}`}
                                  >
                                    <Lotus className="sanctuary-pill-lotus" />
                                    <span>
                                      Gita {v.chapter}.{v.verse}
                                      {v.sanskrit ? ` · ${v.sanskrit.slice(0, 24)}…` : ''}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            ) : null}

                            <div className="history-bubble-actions">
                              <button
                                type="button"
                                className={`history-action-btn ${isSpeaking ? 'history-action-speaking' : ''}`}
                                onClick={() => handleReplayVoice(msg.id, spokenText, msg.language, replyId)}
                                title="Listen to Krishna's voice"
                              >
                                <span>{isSpeaking ? '⏹ Stop' : '▶ Replay Voice'}</span>
                              </button>
                              <button
                                type="button"
                                className="history-action-btn"
                                onClick={() => handleCopyKrishnaText(fullText)}
                                title="Copy Krishna's guidance"
                              >
                                <span>📋 Copy</span>
                              </button>
                              {firstVerse ? (
                                <button
                                  type="button"
                                  className={`history-action-btn ${
                                    savedVerses.isSaved(firstVerse) ? 'history-action-saved' : ''
                                  }`}
                                  onClick={() => {
                                    savedVerses.toggle(firstVerse);
                                    flash(
                                      savedVerses.isSaved(firstVerse)
                                        ? 'Removed from My Gita'
                                        : 'Saved to My Gita',
                                    );
                                  }}
                                  title="Keep verse in My Gita"
                                >
                                  <span>
                                    {savedVerses.isSaved(firstVerse) ? '🔖 Saved' : '🔖 Save Verse'}
                                  </span>
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={msg.id} className="history-bubble history-bubble-error">
                          <div className="history-bubble-header">
                            <span className="history-sender">Notice</span>
                            {timeStr ? <span className="history-msg-time">{timeStr}</span> : null}
                          </div>
                          <p className="history-text">{msg.text}</p>
                        </div>
                      );
                    });
                  })()}
                  <div ref={endRef} />
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
