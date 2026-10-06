'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  chunkSentences,
  nextTalkState,
  nextVadState,
  pickVoice,
  startVad,
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

export type VoiceEngine = 'natural' | 'device';

/**
 * Krishna's voice. With `natural` on and a server reply URL, audio streams from ElevenLabs
 * through one shared <audio>; any failure falls back to the device voice with the same words.
 */
export function useKrishnaVoice(natural = false) {
  const [supported, setSupported] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [lastEngine, setLastEngine] = useState<VoiceEngine | null>(null);
  const token = useRef(0);
  // Chrome can garbage-collect utterances before they finish unless something holds them.
  const queue = useRef<SpeechSynthesisUtterance[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const naturalRef = useRef(natural);
  naturalRef.current = natural;

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
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    audioRef.current?.pause();
    setSpeakingId(null);
  }, []);

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

  const speak = useCallback(
    (id: string, text: string, onDone?: () => void, language = 'en', remoteUrl?: string) => {
      if (!remoteUrl || !naturalRef.current) {
        speakDevice(id, text, onDone, language);
        return;
      }
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

  return { supported: supported || natural, voices, voice, setVoice, speakingId, speak, stop, unlock, lastEngine };
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
        active.current = null;
        setListening(false);
        onEnd({ text: '', error: 'failed' });
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

  return { supported, listening, interim, start, stop, cancel, level: 0, transcribing: false };
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
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch {
        onEnd({ text: '', error: 'not-allowed' });
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

  return { supported: enabled && available, listening, interim: '', start, stop, cancel, level, transcribing };
}

export type TalkTurn = { speak: string; pause: boolean; language?: string; remoteUrl?: string };

/**
 * Hands-free conversation: listen, send what was heard, speak the reply, listen again.
 * The mic is never open while Krishna speaks, so speakers cannot feed his voice back in.
 */
export function useTalkMode(
  voice: ReturnType<typeof useKrishnaVoice>,
  dictation: Pick<Listener, 'start' | 'cancel'>,
  send: (text: string) => Promise<TalkTurn>,
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

  const { cancel: cancelListening } = dictation;
  const { stop: stopSpeaking } = voice;

  useEffect(() => {
    if (state.mode !== 'listening') return;
    const turn = state.turn;
    listenRef.current(({ text, error }) => {
      if (live.current.mode !== 'listening' || live.current.turn !== turn) return;
      if (error === 'not-allowed' || error === 'failed' || error === 'unavailable') {
        dispatch({ type: 'failed', note: micErrorMessage(error) });
        return;
      }
      if (!text) {
        dispatch({ type: 'silence' });
        return;
      }
      dispatch({ type: 'heard', text });
      void sendRef.current(text).then((reply) => {
        if (live.current.mode !== 'thinking') return;
        dispatch({ type: 'replied', pause: reply.pause });
        speakRef.current('talk', reply.speak, () => dispatch({ type: 'doneSpeaking' }), reply.language, reply.remoteUrl);
      });
    });
  }, [state.mode, state.turn]);

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

  return { state, begin, interrupt, end };
}
