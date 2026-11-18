'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

const AMBIENT_PREF_KEY = 'gita.ambientSound';
const AMBIENT_VOL_KEY = 'gita.ambientVolume';
const DEFAULT_VOLUME = 0.18; // 18% volume is soft, serene, and non-intrusive ("lite")
const DUCKED_VOLUME = 0.05;  // 5% volume when Krishna or devotee is speaking

class AmbientManager {
  private static instance: AmbientManager | null = null;
  private audio: HTMLAudioElement | null = null;
  private fadeInterval: number | null = null;
  private currentVolume = 0;
  private targetVolume = DEFAULT_VOLUME;
  private isDucked = false;
  private userEnabled = true;

  private constructor() {
    if (typeof window !== 'undefined') {
      const savedPref = localStorage.getItem(AMBIENT_PREF_KEY);
      this.userEnabled = savedPref !== '0'; // Default enabled

      const savedVol = localStorage.getItem(AMBIENT_VOL_KEY);
      if (savedVol) {
        const parsed = parseFloat(savedVol);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
          this.targetVolume = parsed;
        }
      }
    }
  }

  public static getInstance(): AmbientManager {
    if (!AmbientManager.instance) {
      AmbientManager.instance = new AmbientManager();
    }
    return AmbientManager.instance;
  }

  private initAudio() {
    if (this.audio || typeof window === 'undefined') return;
    this.audio = new Audio('/audio/sanctuary-ambient.wav');
    this.audio.loop = true;
    this.audio.volume = 0;
    this.audio.preload = 'auto';
  }

  public isEnabled(): boolean {
    return this.userEnabled;
  }

  public getVolume(): number {
    return this.targetVolume;
  }

  public setEnabled(enabled: boolean) {
    this.userEnabled = enabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem(AMBIENT_PREF_KEY, enabled ? '1' : '0');
    }
    if (enabled) {
      this.play();
    } else {
      this.stop();
    }
  }

  public setVolume(vol: number) {
    this.targetVolume = Math.max(0, Math.min(1, vol));
    if (typeof window !== 'undefined') {
      localStorage.setItem(AMBIENT_VOL_KEY, this.targetVolume.toString());
    }
    if (this.userEnabled && this.audio && !this.audio.paused && !this.isDucked) {
      this.fadeTo(this.targetVolume, 200);
    }
  }

  public play() {
    if (!this.userEnabled) return;
    this.initAudio();
    if (!this.audio) return;

    if (this.audio.paused) {
      this.audio.volume = 0;
      this.currentVolume = 0;
      const playPromise = this.audio.play();
      if (playPromise) {
        playPromise
          .then(() => {
            const goal = this.isDucked ? DUCKED_VOLUME : this.targetVolume;
            this.fadeTo(goal, 1200);
          })
          .catch(() => {
            // Autoplay policy prevented playback until user gesture
          });
      }
    } else {
      const goal = this.isDucked ? DUCKED_VOLUME : this.targetVolume;
      this.fadeTo(goal, 800);
    }
  }

  public stop() {
    if (!this.audio || this.audio.paused) return;
    this.fadeTo(0, 600, () => {
      if (this.audio) this.audio.pause();
    });
  }

  public duck(ducked: boolean) {
    if (this.isDucked === ducked) return;
    this.isDucked = ducked;
    if (!this.userEnabled || !this.audio || this.audio.paused) return;

    const goal = ducked ? Math.min(this.targetVolume * 0.35, DUCKED_VOLUME) : this.targetVolume;
    this.fadeTo(goal, ducked ? 400 : 900);
  }

  private fadeTo(target: number, durationMs: number, onComplete?: () => void) {
    if (this.fadeInterval) {
      window.clearInterval(this.fadeInterval);
      this.fadeInterval = null;
    }

    if (!this.audio) return;

    const start = this.audio.volume;
    const diff = target - start;
    if (Math.abs(diff) < 0.005) {
      this.audio.volume = target;
      this.currentVolume = target;
      onComplete?.();
      return;
    }

    const steps = Math.max(10, Math.floor(durationMs / 30));
    const stepDiff = diff / steps;
    let step = 0;

    this.fadeInterval = window.setInterval(() => {
      step++;
      if (!this.audio) {
        if (this.fadeInterval) window.clearInterval(this.fadeInterval);
        return;
      }

      const nextVol = Math.max(0, Math.min(1, start + stepDiff * step));
      this.audio.volume = nextVol;
      this.currentVolume = nextVol;

      if (step >= steps) {
        if (this.fadeInterval) window.clearInterval(this.fadeInterval);
        this.fadeInterval = null;
        this.audio.volume = target;
        this.currentVolume = target;
        onComplete?.();
      }
    }, 30);
  }
}

export function useAmbientSound() {
  const [enabled, setEnabledState] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(AMBIENT_PREF_KEY) !== '0';
  });
  const [volume, setVolumeState] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_VOLUME;
    const saved = localStorage.getItem(AMBIENT_VOL_KEY);
    return saved ? parseFloat(saved) || DEFAULT_VOLUME : DEFAULT_VOLUME;
  });

  const managerRef = useRef<AmbientManager | null>(null);

  useEffect(() => {
    managerRef.current = AmbientManager.getInstance();
  }, []);

  const toggle = useCallback(() => {
    const next = !enabled;
    setEnabledState(next);
    managerRef.current?.setEnabled(next);
  }, [enabled]);

  const setVolume = useCallback((vol: number) => {
    setVolumeState(vol);
    managerRef.current?.setVolume(vol);
  }, []);

  const play = useCallback(() => {
    managerRef.current?.play();
  }, []);

  const stop = useCallback(() => {
    managerRef.current?.stop();
  }, []);

  const duck = useCallback((ducked: boolean) => {
    managerRef.current?.duck(ducked);
  }, []);

  return {
    enabled,
    volume,
    toggle,
    setVolume,
    play,
    stop,
    duck,
  };
}
