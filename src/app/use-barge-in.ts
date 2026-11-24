'use client';

import { useEffect, useRef } from 'react';
import { checkBargeIn, initialBargeInTracker, type BargeInTracker } from '@/lib/speech';

export const BARGE_IN_PREF_KEY = 'gita.barge_in';

export type UseBargeInOptions = {
  enabled: boolean;
  isSpeaking: boolean;
  onBargeIn: () => void;
};

/**
 * Hands-Free Voice Barge-In Hook (ChatGPT Advanced Voice Mode style).
 *
 * While Krishna is speaking, this hook listens to the user's microphone with
 * hardware/browser Acoustic Echo Cancellation (AEC) enabled.
 * If the devotee starts speaking aloud with sustained vocal energy, it detects
 * human speech, ignores transient room clicks, and immediately triggers `onBargeIn()`.
 */
export function useBargeIn({ enabled, isSpeaking, onBargeIn }: UseBargeInOptions): void {
  const onBargeInRef = useRef(onBargeIn);
  onBargeInRef.current = onBargeIn;

  useEffect(() => {
    if (!enabled || !isSpeaking) return;

    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    let timer: number | null = null;
    let tracker: BargeInTracker = initialBargeInTracker();
    let cancelled = false;

    const CHECK_INTERVAL_MS = 60;

    async function startListening() {
      try {
        if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) return;

        // Request audio with mandatory Acoustic Echo Cancellation (AEC).
        // The browser's WebRTC Audio Processing Module (APM) will automatically
        // phase-invert and subtract Krishna's speaker output from the mic input!
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;

        audioContext = new AudioCtx();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.25;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        const frame = new Float32Array(analyser.fftSize);
        const startedAt = Date.now();
        // Give browser AEC 500ms to converge and cancel Krishna's voice,
        // and ignore transient speech remnants from prior utterances.
        const STARTUP_GRACE_MS = 500;

        timer = window.setInterval(() => {
          if (cancelled) return;
          if (Date.now() - startedAt < STARTUP_GRACE_MS) return;

          analyser.getFloatTimeDomainData(frame);

          let sum = 0;
          for (let i = 0; i < frame.length; i += 1) {
            sum += frame[i] * frame[i];
          }
          const rms = Math.sqrt(sum / frame.length);

          tracker = checkBargeIn(tracker, rms, CHECK_INTERVAL_MS);

          if (tracker.triggered) {
            cancelled = true;
            cleanup();
            // Provide a 75ms grace window for the OS audio device driver to release
            // the hardware handle before the dictation/STT stream initializes.
            window.setTimeout(() => {
              onBargeInRef.current();
            }, 75);
          }
        }, CHECK_INTERVAL_MS);
      } catch {
        // Permissions not granted yet or audio input unavailable.
        // Fails gracefully; tap-to-interrupt remains fully functional.
      }
    }

    function cleanup() {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
      }
      if (audioContext && audioContext.state !== 'closed') {
        void audioContext.close();
        audioContext = null;
      }
    }

    void startListening();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [enabled, isSpeaking]);
}
