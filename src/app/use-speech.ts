'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { chunkSentences, nextTalkState, pickVoice, TALK_OFF, VOICE_PITCH, VOICE_RATE, type TalkState } from '@/lib/speech';

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

export function useKrishnaVoice() {
  const [supported, setSupported] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const token = useRef(0);
  // Chrome can garbage-collect utterances before they finish unless something holds them.
  const queue = useRef<SpeechSynthesisUtterance[]>([]);

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
    setSpeakingId(null);
  }, []);

  const speak = useCallback(
    (id: string, text: string, onDone?: () => void) => {
      if (!('speechSynthesis' in window)) {
        onDone?.();
        return;
      }
      const synth = window.speechSynthesis;
      synth.cancel();
      const mine = ++token.current;
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
      queue.current = chunks.map((chunk, index) => {
        const utterance = new SpeechSynthesisUtterance(chunk);
        if (voice) {
          utterance.voice = voice;
          utterance.lang = voice.lang;
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
    [voice],
  );

  return { supported, voices, voice, setVoice, speakingId, speak, stop };
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

export type DictationEnd = { text: string; error?: 'no-speech' | 'not-allowed' | 'failed' };

export function micErrorMessage(error: DictationEnd['error']): string {
  if (error === 'not-allowed') return 'Microphone access is blocked. Allow it in the browser address bar to speak.';
  if (error === 'failed') return 'Voice input stopped unexpectedly. Please try again.';
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
    (onEnd: (result: DictationEnd) => void) => {
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

  return { supported, listening, interim, start, stop, cancel };
}

export type TalkTurn = { speak: string; pause: boolean };

/**
 * Hands-free conversation: listen, send what was heard, speak the reply, listen again.
 * The mic is never open while Krishna speaks, so speakers cannot feed his voice back in.
 */
export function useTalkMode(
  voice: ReturnType<typeof useKrishnaVoice>,
  dictation: ReturnType<typeof useDictation>,
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
      if (error === 'not-allowed' || error === 'failed') {
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
        speakRef.current('talk', reply.speak, () => dispatch({ type: 'doneSpeaking' }));
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
