'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { updateVoiceMediaSession } from '@/lib/ambient-sound';
import { avatarEngine } from './avatar/anam-engine';
import {
  chunkSentences,
  nextTalkState,
  nextVadState,
  pickVoice,
  startVad,
  stitchThoughts,
  TALK_OFF,
  voiceForLanguage,
  VOICE_PITCH,
  VOICE_RATE,
  type TalkState,
  type VadState,
} from '@/lib/speech';

export function readPref(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked (private mode); preferences then last for this visit only.
  }
}

const VOICE_KEY = 'gita.voice';

/** A tenth of a second of 8-bit silence, played on a tap so Safari lets the shared element play later on its own. */
function silentWav(): string {
  const samples = 800;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, 'data');
  view.setUint32(40, samples, true);
  bytes.fill(128, 44);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

export type VoiceEngine = 'natural' | 'device' | 'avatar';

export type PipelinedChunk = {
  id: string;
  text: string;
  chunkIndex: number;
  remoteUrl?: string;
  language?: string;
};

/**
 * Krishna's voice. With `natural` on and a server reply URL, audio streams from ElevenLabs
 * through one shared <audio>; any failure falls back to the device voice with the same words.
 */
/** `avatar`: when Krishna's live face is connected, replies are spoken through it (same voice, lips in sync). */
export function useKrishnaVoice(natural = false, avatar = false) {
  const [supported, setSupported] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState<string | null>(null);
  const [speakingId, setSpeakingIdState] = useState<string | null>(null);
  const speakingIdRef = useRef<string | null>(null);
  const [lastEngine, setLastEngine] = useState<VoiceEngine | null>(null);
  const token = useRef(0);
  // Chrome can garbage-collect utterances before they finish unless something holds them.
  const queue = useRef<SpeechSynthesisUtterance[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const naturalRef = useRef(natural);
  naturalRef.current = natural;
  const avatarRef = useRef(avatar);
  avatarRef.current = avatar;

  // Pipelined Audio Player state
  const pipelinedQueueRef = useRef<PipelinedChunk[]>([]);
  const pipelinedActiveRef = useRef<PipelinedChunk | null>(null);
  const pipelinedFinalizedRef = useRef<boolean>(false);
  const pipelinedOnDoneRef = useRef<(() => void) | undefined>(undefined);
  const pipelinedNextAudioRef = useRef<HTMLAudioElement | null>(null);

  const setSpeakingId = useCallback((id: string | null) => {
    speakingIdRef.current = id;
    setSpeakingIdState(id);
    updateVoiceMediaSession(Boolean(id), 'Lord Krishna Speaking');
  }, []);

  const audio = useCallback(() => {
    audioRef.current ??= new Audio();
    return audioRef.current;
  }, []);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    setSupported(true);
    setVoiceName(readPref(VOICE_KEY));
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', load);
      window.speechSynthesis.cancel();
      audioRef.current?.pause();
    };
  }, []);

  const voice = pickVoice(voices, voiceName);

  const setVoice = useCallback((name: string) => {
    setVoiceName(name);
    writePref(VOICE_KEY, name);
  }, []);

  const stop = useCallback(() => {
    token.current += 1;
    queue.current = [];
    pipelinedQueueRef.current = [];
    pipelinedActiveRef.current = null;
    pipelinedFinalizedRef.current = false;
    pipelinedOnDoneRef.current = undefined;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    audioRef.current?.pause();
    avatarEngine().stop();
    setSpeakingId(null);
  }, [setSpeakingId]);

  /** Call inside a tap handler before speech that will start later (Talk mode, auto-play). */
  const unlock = useCallback(() => {
    if (!naturalRef.current) return;
    const element = audio();
    if (element.src && !element.paused) return;
    element.src = silentWav();
    void element.play().catch(() => undefined);
  }, [audio]);

  const speakDevice = useCallback(
    (id: string, text: string, onDone?: () => void, language = 'en') => {
      if (!('speechSynthesis' in window)) {
        setSpeakingId(null);
        onDone?.();
        return;
      }
      const synth = window.speechSynthesis;
      synth.cancel();
      const mine = ++token.current;
      setLastEngine('device');
      const chunks = chunkSentences(text);
      if (chunks.length === 0) {
        onDone?.();
        return;
      }
      const finish = () => {
        if (token.current !== mine) return;
        queue.current = [];
        setSpeakingId(null);
        onDone?.();
      };
      const local = voiceForLanguage(voices, language);
      queue.current = chunks.map((chunk, index) => {
        const utterance = new SpeechSynthesisUtterance(chunk);
        if (language === 'en' && voice) {
          utterance.voice = voice;
          utterance.lang = voice.lang;
        } else if (local) {
          utterance.voice = local;
          utterance.lang = local.lang;
        } else {
          utterance.lang = `${language}-IN`;
        }
        utterance.rate = VOICE_RATE;
        utterance.pitch = VOICE_PITCH;
        if (index === chunks.length - 1) utterance.onend = finish;
        utterance.onerror = (event) => {
          if (event.error !== 'interrupted' && event.error !== 'canceled') finish();
        };
        return utterance;
      });
      setSpeakingId(id);
      for (const utterance of queue.current) synth.speak(utterance);
    },
    [voice, voices],
  );

  /** The natural voice through the browser's audio player, falling back to the device voice. */
  const speakAudio = useCallback(
    (id: string, text: string, onDone: (() => void) | undefined, language: string, remoteUrl: string) => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      const element = audio();
      element.pause();
      const mine = ++token.current;
      const settle = () => {
        element.onended = null;
        element.onerror = null;
      };
      const fallBack = () => {
        if (token.current !== mine) return;
        settle();
        speakDevice(id, text, onDone, language);
      };
      element.onended = () => {
        if (token.current !== mine) return;
        settle();
        setSpeakingId(null);
        onDone?.();
      };
      element.onerror = fallBack;
      element.src = remoteUrl;
      setSpeakingId(id);
      element
        .play()
        .then(() => {
          if (token.current === mine) setLastEngine('natural');
        })
        .catch(fallBack);
    },
    [audio, speakDevice],
  );

  const speak = useCallback(
    (id: string, text: string, onDone?: () => void, language = 'en', remoteUrl?: string) => {
      if (!remoteUrl || !naturalRef.current) {
        speakDevice(id, text, onDone, language);
        return;
      }
      const face = avatarEngine();
      if (!avatarRef.current || face.state !== 'ready') {
        speakAudio(id, text, onDone, language, remoteUrl);
        return;
      }
      // Live face: the same ElevenLabs voice, as raw audio, with Krishna's lips moving to it.
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      audioRef.current?.pause();
      const mine = ++token.current;
      setSpeakingId(id);
      const pcmUrl = `${remoteUrl}${remoteUrl.includes('?') ? '&' : '?'}format=pcm`;
      void face
        .speak(pcmUrl, {
          onDone: () => {
            if (token.current !== mine) return;
            setSpeakingId(null);
            onDone?.();
          },
          onLost: () => {
            if (token.current === mine) speakAudio(id, text, onDone, language, remoteUrl);
          },
        })
        .then((started) => {
          if (token.current !== mine) return;
          if (started) setLastEngine('avatar');
          else speakAudio(id, text, onDone, language, remoteUrl);
        });
    },
    [speakAudio, speakDevice, setSpeakingId],
  );

  const playNextChunk = useCallback(() => {
    const myToken = token.current;

    if (pipelinedQueueRef.current.length === 0) {
      if (pipelinedFinalizedRef.current) {
        pipelinedActiveRef.current = null;
        setSpeakingId(null);
        const onDone = pipelinedOnDoneRef.current;
        pipelinedOnDoneRef.current = undefined;
        onDone?.();
      } else {
        pipelinedActiveRef.current = null;
      }
      return;
    }

    const chunk = pipelinedQueueRef.current.shift()!;
    pipelinedActiveRef.current = chunk;
    setSpeakingId(chunk.id);

    if (chunk.remoteUrl && naturalRef.current) {
      const element = audio();
      element.pause();
      setLastEngine('natural');

      const onChunkDone = () => {
        if (token.current !== myToken) return;
        element.onended = null;
        element.onerror = null;
        playNextChunk();
      };

      const onChunkError = () => {
        if (token.current !== myToken) return;
        element.onended = null;
        element.onerror = null;
        speakDevice(chunk.id, chunk.text, onChunkDone, chunk.language || 'en');
      };

      element.onended = onChunkDone;
      element.onerror = onChunkError;
      element.src = chunk.remoteUrl;
      element.play().catch(onChunkError);

      if (pipelinedQueueRef.current.length > 0 && pipelinedQueueRef.current[0].remoteUrl) {
        const nextUrl = pipelinedQueueRef.current[0].remoteUrl;
        const preloader = new Audio();
        preloader.preload = 'auto';
        preloader.src = nextUrl;
        pipelinedNextAudioRef.current = preloader;
      }
    } else {
      setLastEngine('device');
      speakDevice(
        chunk.id,
        chunk.text,
        () => {
          if (token.current !== myToken) return;
          playNextChunk();
        },
        chunk.language || 'en',
      );
    }
  }, [audio, setSpeakingId, speakDevice]);

  const pipelineChunk = useCallback(
    (chunk: PipelinedChunk) => {
      if (speakingIdRef.current !== chunk.id) {
        token.current += 1;
        pipelinedQueueRef.current = [];
        pipelinedActiveRef.current = null;
        pipelinedFinalizedRef.current = false;
        pipelinedOnDoneRef.current = undefined;
        setSpeakingId(chunk.id);
      }

      pipelinedQueueRef.current.push(chunk);

      if (!pipelinedActiveRef.current) {
        playNextChunk();
      } else if (pipelinedQueueRef.current.length === 1 && chunk.remoteUrl && naturalRef.current) {
        const preloader = new Audio();
        preloader.preload = 'auto';
        preloader.src = chunk.remoteUrl;
        pipelinedNextAudioRef.current = preloader;
      }
    },
    [playNextChunk, setSpeakingId],
  );

  const pipelineFinalize = useCallback(
    (id: string, onDone?: () => void) => {
      if (speakingIdRef.current === id || pipelinedActiveRef.current) {
        pipelinedFinalizedRef.current = true;
        pipelinedOnDoneRef.current = onDone;
        if (!pipelinedActiveRef.current && pipelinedQueueRef.current.length === 0) {
          setSpeakingId(null);
          onDone?.();
        }
      } else {
        onDone?.();
      }
    },
    [setSpeakingId],
  );

  return {
    supported: supported || natural,
    voices,
    voice,
    setVoice,
    speakingId,
    speak,
    pipelineChunk,
    pipelineFinalize,
    stop,
    unlock,
    lastEngine,
  };
}

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  const scope = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export type DictationEnd = { text: string; error?: 'no-speech' | 'not-allowed' | 'failed' | 'unavailable' };

/** What the mic button and Talk mode need from either the browser recognizer or the Scribe recorder. */
export type Listener = {
  supported: boolean;
  listening: boolean;
  interim: string;
  level: number;
  transcribing: boolean;
  hasSpeech?: () => boolean;
  start(onEnd: (result: DictationEnd) => void, options?: ListenOptions): void | Promise<void>;
  stop(): void;
  cancel(): void;
};

export type ListenOptions = {
  /** Stop by itself after a pause (Talk mode). Off for the mic button, which the user stops by tapping. */
  autoStop?: boolean;
};

export function micErrorMessage(error: DictationEnd['error']): string {
  if (error === 'not-allowed') return 'Microphone access is blocked. Allow it in the browser address bar to speak.';
  if (error === 'failed') return 'Voice input stopped unexpectedly. Please try again.';
  if (error === 'unavailable') return 'The natural voice service is unavailable right now. Switched to the browser microphone; please try again.';
  return '';
}

export function useDictation(lang: string) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const active = useRef<Recognition | null>(null);

  useEffect(() => {
    setSupported(recognitionCtor() !== null);
    return () => active.current?.abort();
  }, []);

  const start = useCallback(
    (onEnd: (result: DictationEnd) => void, _options?: ListenOptions) => {
      const Ctor = recognitionCtor();
      if (!Ctor) return;
      active.current?.abort();
      const recognition = new Ctor();
      recognition.lang = lang;
      recognition.interimResults = true;
      recognition.continuous = false;
      let finalText = '';
      let error: DictationEnd['error'];
      recognition.onresult = (event) => {
        let partial = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          if (result.isFinal) finalText += `${result[0].transcript} `;
          else partial += result[0].transcript;
        }
        setInterim(`${finalText}${partial}`.trim());
      };
      recognition.onerror = (event) => {
        if (event.error === 'no-speech') error = 'no-speech';
        else if (event.error === 'not-allowed' || event.error === 'service-not-allowed') error = 'not-allowed';
        else if (event.error !== 'aborted') error = 'failed';
      };
      recognition.onend = () => {
        if (active.current !== recognition) return;
        active.current = null;
        setListening(false);
        setInterim('');
        onEnd({ text: finalText.trim(), error: finalText.trim() ? undefined : error });
      };
      active.current = recognition;
      setListening(true);
      setInterim('');
      try {
        recognition.start();
      } catch {
        // If the speech engine is resetting after aborting the previous utterance, retry once after 100ms
        window.setTimeout(() => {
          if (active.current !== recognition) return;
          try {
            recognition.start();
          } catch {
            active.current = null;
            setListening(false);
            onEnd({ text: '', error: 'failed' });
          }
        }, 100);
      }
    },
    [lang],
  );

  /** Ends listening and keeps what was heard. */
  const stop = useCallback(() => active.current?.stop(), []);

  /** Ends listening and throws away what was heard. */
  const cancel = useCallback(() => {
    const current = active.current;
    active.current = null;
    current?.abort();
    setListening(false);
    setInterim('');
  }, []);

  const hasSpeech = useCallback(() => Boolean(interim.trim()), [interim]);

  return { supported, listening, interim, start, stop, cancel, level: 0, transcribing: false, hasSpeech };
}

const RECORDER_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

type Recording = {
  stream: MediaStream;
  recorder: MediaRecorder;
  context: AudioContext;
  timer: number;
  chunks: Blob[];
  vad: VadState;
  cancelled: boolean;
  onEnd: (result: DictationEnd) => void;
};

/**
 * Records the user's voice and transcribes it with ElevenLabs Scribe on the server.
 * Same shape as useDictation, so the mic button and Talk mode use either one.
 */
export function useRecorder(lang: string, enabled: boolean) {
  const [available, setAvailable] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [level, setLevel] = useState(0);
  const active = useRef<Recording | null>(null);

  useEffect(() => {
    setAvailable(typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia));
    return () => {
      const current = active.current;
      if (!current) return;
      current.cancelled = true;
      window.clearInterval(current.timer);
      if (current.recorder.state !== 'inactive') current.recorder.stop();
    };
  }, []);

  const hint = lang.startsWith('en') ? '' : lang.slice(0, 2);

  const upload = useCallback(
    async (blob: Blob): Promise<DictationEnd> => {
      const form = new FormData();
      form.append('audio', blob, blob.type.includes('mp4') ? 'speech.mp4' : 'speech.webm');
      if (hint) form.append('language', hint);
      try {
        const response = await fetch('/api/stt', { method: 'POST', body: form });
        if (response.status === 503 || response.status === 429) return { text: '', error: 'unavailable' };
        if (!response.ok) return { text: '', error: 'failed' };
        const data = (await response.json()) as { text?: string };
        const text = data.text?.trim() ?? '';
        return text ? { text } : { text: '', error: 'no-speech' };
      } catch {
        return { text: '', error: 'failed' };
      }
    },
    [hint],
  );

  const finish = useCallback(() => {
    const current = active.current;
    if (!current) return;
    window.clearInterval(current.timer);
    if (current.recorder.state !== 'inactive') current.recorder.stop();
  }, []);

  const start = useCallback(
    async (onEnd: (result: DictationEnd) => void, options: ListenOptions = {}) => {
      const autoStop = options.autoStop ?? true;
      if (active.current) {
        active.current.cancelled = true;
        finish();
      }
      let stream: MediaStream | null = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          });
          break;
        } catch (err) {
          if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
            onEnd({ text: '', error: 'not-allowed' });
            return;
          }
          if (attempt < 2) {
            await new Promise((resolve) => window.setTimeout(resolve, 80));
          }
        }
      }
      if (!stream) {
        onEnd({ text: '', error: 'failed' });
        return;
      }
      const mimeType = RECORDER_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      context.createMediaStreamSource(stream).connect(analyser);
      const frame = new Float32Array(analyser.fftSize);

      const recording: Recording = {
        stream,
        recorder,
        context,
        timer: 0,
        chunks: [],
        vad: startVad(performance.now()),
        cancelled: false,
        onEnd,
      };
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recording.chunks.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        void context.close();
        if (active.current === recording) active.current = null;
        setListening(false);
        setLevel(0);
        if (recording.cancelled) return;
        if (!recording.vad.heardSpeech) {
          onEnd({ text: '', error: 'no-speech' });
          return;
        }
        setTranscribing(true);
        void upload(new Blob(recording.chunks, { type: recorder.mimeType || 'audio/webm' })).then((result) => {
          setTranscribing(false);
          onEnd(result);
        });
      };
      // An interval rather than requestAnimationFrame, which stops in background tabs.
      recording.timer = window.setInterval(() => {
        analyser.getFloatTimeDomainData(frame);
        let sum = 0;
        for (const sample of frame) sum += sample * sample;
        const rms = Math.sqrt(sum / frame.length);
        setLevel(Math.min(1, rms * 8));
        recording.vad = nextVadState(recording.vad, rms, performance.now(), autoStop);
        if (recording.vad.stop) finish();
      }, 100);

      active.current = recording;
      setListening(true);
      recorder.start(250);
    },
    [finish, upload],
  );

  /** Ends listening and keeps what was heard. */
  const stop = useCallback(() => finish(), [finish]);

  /** Ends listening and throws away what was heard. */
  const cancel = useCallback(() => {
    if (active.current) active.current.cancelled = true;
    finish();
    setTranscribing(false);
  }, [finish]);

  const hasSpeech = useCallback(() => {
    return Boolean(active.current?.vad.heardSpeech || transcribing);
  }, [transcribing]);

  return { supported: enabled && available, listening, interim: '', start, stop, cancel, level, transcribing, hasSpeech };
}

export type TalkTurn = {
  speak: string;
  pause: boolean;
  language?: string;
  remoteUrl?: string;
  aborted?: boolean;
  pipelined?: boolean;
};

export type TalkModeOptions = {
  onStitch?: (mergedText: string, additionalText: string) => void;
};

/**
 * Hands-free conversation: listen, send what was heard, speak the reply, listen again.
 * Features Contemplative Silence & Thought Stitching:
 * - Listens actively even during 'thinking' state so late utterances merge automatically.
 * - Holds server reply if devotee is actively speaking continuation thoughts.
 * - Cancels mic cleanly before Krishna speaks so his own voice is never fed back.
 */
export function useTalkMode(
  voice: ReturnType<typeof useKrishnaVoice>,
  dictation: Pick<Listener, 'start' | 'cancel'> & { hasSpeech?: () => boolean },
  send: (text: string, isStitch?: boolean) => Promise<TalkTurn>,
  options?: TalkModeOptions,
) {
  const [state, dispatch] = useReducer(nextTalkState, TALK_OFF);
  const live = useRef<TalkState>(state);
  live.current = state;
  const sendRef = useRef(send);
  sendRef.current = send;
  const speakRef = useRef(voice.speak);
  speakRef.current = voice.speak;
  const listenRef = useRef(dictation.start);
  listenRef.current = dictation.start;
  const hasSpeechRef = useRef(dictation.hasSpeech);
  hasSpeechRef.current = dictation.hasSpeech;
  const onStitchRef = useRef(options?.onStitch);
  onStitchRef.current = options?.onStitch;

  const { cancel: cancelListening } = dictation;
  const { stop: stopSpeaking } = voice;

  const lastSpeechRef = useRef<string>('');
  const inFlightTokenRef = useRef<number>(0);
  const heldReplyRef = useRef<TalkTurn | null>(null);

  // 1. Listening Phase (Normal speech input)
  useEffect(() => {
    if (state.mode !== 'listening') return;
    const turn = state.turn;
    heldReplyRef.current = null;

    listenRef.current(({ text, error }) => {
      if (live.current.mode !== 'listening' || live.current.turn !== turn) return;
      if (error === 'not-allowed' || error === 'failed' || error === 'unavailable') {
        dispatch({ type: 'failed', note: micErrorMessage(error) });
        return;
      }
      const spoken = text?.trim() ?? '';
      if (!spoken) {
        dispatch({ type: 'silence' });
        return;
      }

      lastSpeechRef.current = spoken;
      const myToken = ++inFlightTokenRef.current;
      dispatch({ type: 'heard', text: spoken });

      void sendRef.current(spoken, false).then((reply) => {
        if (reply?.aborted || inFlightTokenRef.current !== myToken) return;

        if (reply?.pipelined) {
          if (live.current.mode === 'thinking') {
            dispatch({ type: 'replied', pause: reply.pause });
          }
          voice.pipelineFinalize('talk', () => dispatch({ type: 'doneSpeaking' }));
          return;
        }

        if (live.current.mode !== 'thinking') return;

        // If devotee started speaking continuation during thinking:
        if (hasSpeechRef.current?.()) {
          heldReplyRef.current = reply;
          return;
        }

        dispatch({ type: 'replied', pause: reply.pause });
        speakRef.current('talk', reply.speak, () => dispatch({ type: 'doneSpeaking' }), reply.language, reply.remoteUrl);
      });
    });
  }, [state.mode, state.turn]);

  // 2. Thinking Phase: Active Listener to remove deaf blindspot and auto-stitch continuation thoughts
  useEffect(() => {
    if (state.mode !== 'thinking') return;
    const turn = state.turn;
    let cancelled = false;

    // Small grace delay (60ms) to ensure audio hardware handle is ready
    const timer = window.setTimeout(() => {
      if (cancelled || live.current.mode !== 'thinking' || live.current.turn !== turn) return;

      function startListeningDuringThinking() {
        if (cancelled || live.current.mode !== 'thinking' || live.current.turn !== turn) return;

        listenRef.current(({ text, error }) => {
          if (cancelled || live.current.mode !== 'thinking' || live.current.turn !== turn) return;

          const additional = text?.trim() ?? '';
          if (!additional) {
            // No speech recognized in this slice.
            // If a server reply was held waiting on this check (e.g. cough/noise), play it now!
            if (heldReplyRef.current && live.current.mode === 'thinking') {
              const reply = heldReplyRef.current;
              heldReplyRef.current = null;
              dispatch({ type: 'replied', pause: reply.pause });
              speakRef.current('talk', reply.speak, () => dispatch({ type: 'doneSpeaking' }), reply.language, reply.remoteUrl);
              return;
            }
            // Loop listener while Krishna is still reflecting, unless permission failed
            if (live.current.mode === 'thinking' && live.current.turn === turn && error !== 'not-allowed' && error !== 'failed') {
              startListeningDuringThinking();
            }
            return;
          }

          // Devotee spoke continuation thought! Thought Stitching triggers:
          heldReplyRef.current = null;
          const merged = stitchThoughts(lastSpeechRef.current, additional);
          lastSpeechRef.current = merged;

          onStitchRef.current?.(merged, additional);

          const myToken = ++inFlightTokenRef.current;
          dispatch({ type: 'stitch', text: merged });

          void sendRef.current(merged, true).then((reply) => {
            if (reply?.aborted || inFlightTokenRef.current !== myToken) return;

            if (reply?.pipelined) {
              if (live.current.mode === 'thinking') {
                dispatch({ type: 'replied', pause: reply.pause });
              }
              voice.pipelineFinalize('talk', () => dispatch({ type: 'doneSpeaking' }));
              return;
            }

            if (live.current.mode !== 'thinking') return;

            if (hasSpeechRef.current?.()) {
              heldReplyRef.current = reply;
              return;
            }

            dispatch({ type: 'replied', pause: reply.pause });
            speakRef.current('talk', reply.speak, () => dispatch({ type: 'doneSpeaking' }), reply.language, reply.remoteUrl);
          });
        });
      }

      startListeningDuringThinking();
    }, 60);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      cancelListening();
    };
  }, [state.mode, state.turn, cancelListening]);

  const notifySpeaking = useCallback(() => {
    if (live.current.mode === 'thinking') {
      dispatch({ type: 'replied', pause: false });
    }
  }, []);

  const begin = useCallback(() => {
    stopSpeaking();
    dispatch({ type: 'start' });
  }, [stopSpeaking]);

  const interrupt = useCallback(() => {
    stopSpeaking();
    dispatch({ type: 'interrupt' });
  }, [stopSpeaking]);

  const end = useCallback(() => {
    cancelListening();
    stopSpeaking();
    dispatch({ type: 'end' });
  }, [cancelListening, stopSpeaking]);

  return { state, begin, interrupt, end, notifySpeaking };
}
