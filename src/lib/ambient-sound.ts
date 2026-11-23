'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export const AMBIENT_PREF_KEY = 'gita.ambientSound';
export const AMBIENT_VOL_KEY = 'gita.ambientVolume';
export const AMBIENT_TRACK_KEY = 'gita.ambientTrack';

export const DEFAULT_AMBIENT_TRACK = '/audio/sanctuary-ambient.wav';
export const CUSTOM_AMBIENT_TRACK = '/audio/krishna-flute-ambient.mp3';

export type AmbientTrackOption = {
  id: string;
  name: string;
  path: string;
  description: string;
};

export const AMBIENT_TRACKS: AmbientTrackOption[] = [
  {
    id: 'krishna-flute',
    name: 'Krishna Flute & Bhakti Music',
    path: CUSTOM_AMBIENT_TRACK,
    description: 'Devotional Krishna bansuri flute and sacred bhakti songs',
  },
  {
    id: 'sanctuary-tanpura',
    name: 'Sacred Sanctuary Soundscape',
    path: DEFAULT_AMBIENT_TRACK,
    description: 'Om drone, meditative Tanpura plucks, and subtle bansuri',
  },
];

const DEFAULT_VOLUME = 0.05; // 5% default volume (gentle, peaceful background)
const DUCKED_VOLUME = 0.02;  // 2% volume when Krishna or devotee is speaking

class AmbientManager {
  private static instance: AmbientManager | null = null;
  private audio: HTMLAudioElement | null = null;
  private fadeInterval: number | null = null;
  private currentVolume = 0;
  private targetVolume = DEFAULT_VOLUME;
  private isDucked = false;
  private userEnabled = true;
  private currentTrack = CUSTOM_AMBIENT_TRACK;
  private isFallback = false;
  private listeners = new Set<() => void>();

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

      const savedTrack = localStorage.getItem(AMBIENT_TRACK_KEY);
      if (savedTrack) {
        this.currentTrack = savedTrack;
      } else {
        this.currentTrack = CUSTOM_AMBIENT_TRACK;
      }
    }
  }

  public static getInstance(): AmbientManager {
    if (!AmbientManager.instance) {
      AmbientManager.instance = new AmbientManager();
    }
    return AmbientManager.instance;
  }

  public subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  public updateMediaSession(isPlaying: boolean) {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      const activeTrack = AMBIENT_TRACKS.find((t) => t.path === this.currentTrack);
      const title = activeTrack ? activeTrack.name : 'Sacred Sanctuary Music';
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist: 'Speak with Krishna',
        album: 'Bhagavad Gita Sanctuary',
        artwork: [
          { src: '/krishna/avatar-192.webp', sizes: '192x192', type: 'image/webp' },
          { src: '/krishna/avatar-512.webp', sizes: '512x512', type: 'image/webp' },
          { src: '/krishna/portrait-1200.webp', sizes: '1200x1200', type: 'image/webp' },
        ],
      });
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

      navigator.mediaSession.setActionHandler('play', () => {
        this.setEnabled(true);
        this.play();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        this.stop();
      });
      navigator.mediaSession.setActionHandler('stop', () => {
        this.stop();
      });
    } catch {
      // MediaSession is optional, gracefully ignore if restricted in iframe/sandbox
    }
  }

  private initAudio() {
    if (this.audio || typeof window === 'undefined') return;
    this.audio = new Audio(this.currentTrack);
    this.audio.loop = true;
    this.audio.volume = 0;
    this.audio.preload = 'auto';

    // Automatic Fallback System:
    // If the custom music fails to load, 404s, or has a decoding error,
    // seamlessly switch back to the default sanctuary track!
    this.audio.addEventListener('error', (e) => {
      if (this.currentTrack !== DEFAULT_AMBIENT_TRACK) {
        console.warn(
          `[AmbientSound] Custom music "${this.currentTrack}" failed to load. Gracefully switching back to default track.`,
          e
        );
        this.fallbackToDefault();
      }
    });
  }

  public isEnabled(): boolean {
    return this.userEnabled;
  }

  public getVolume(): number {
    return this.targetVolume;
  }

  public getTrack(): string {
    return this.currentTrack;
  }

  public getIsFallback(): boolean {
    return this.isFallback;
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
    this.notify();
  }

  public setVolume(vol: number) {
    this.targetVolume = Math.max(0, Math.min(1, vol));
    if (typeof window !== 'undefined') {
      localStorage.setItem(AMBIENT_VOL_KEY, this.targetVolume.toString());
    }
    if (this.userEnabled && this.audio && !this.audio.paused && !this.isDucked) {
      this.fadeTo(this.targetVolume, 200);
    }
    this.notify();
  }

  public setTrack(trackPath: string) {
    if (!trackPath || trackPath === this.currentTrack) return;
    this.currentTrack = trackPath;
    this.isFallback = false;
    if (typeof window !== 'undefined') {
      localStorage.setItem(AMBIENT_TRACK_KEY, trackPath);
    }
    if (this.audio) {
      const wasPlaying = !this.audio.paused;
      this.audio.src = trackPath;
      this.audio.load();
      if (wasPlaying && this.userEnabled) {
        const p = this.audio.play();
        if (p) {
          p.then(() => {
            const goal = this.isDucked ? DUCKED_VOLUME : this.targetVolume;
            this.fadeTo(goal, 1200);
            this.updateMediaSession(true);
          }).catch(() => {});
        }
      }
    }
    this.notify();
  }

  public fallbackToDefault() {
    if (this.currentTrack === DEFAULT_AMBIENT_TRACK) return;
    this.currentTrack = DEFAULT_AMBIENT_TRACK;
    this.isFallback = true;
    if (this.audio) {
      const wasPlaying = !this.audio.paused || this.userEnabled;
      this.audio.src = DEFAULT_AMBIENT_TRACK;
      this.audio.load();
      if (wasPlaying && this.userEnabled) {
        const p = this.audio.play();
        if (p) {
          p.then(() => {
            const goal = this.isDucked ? DUCKED_VOLUME : this.targetVolume;
            this.fadeTo(goal, 1200);
            this.updateMediaSession(true);
          }).catch(() => {});
        }
      }
    }
    this.notify();
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
            this.updateMediaSession(true);
          })
          .catch((err) => {
            if (err?.name === 'NotAllowedError') {
              // Autoplay policy prevented playback until user gesture
              return;
            }
            if (this.currentTrack !== DEFAULT_AMBIENT_TRACK) {
              console.warn('[AmbientSound] Playback error on custom track, falling back to default:', err);
              this.fallbackToDefault();
            }
          });
      }
    } else {
      const goal = this.isDucked ? DUCKED_VOLUME : this.targetVolume;
      this.fadeTo(goal, 800);
      this.updateMediaSession(true);
    }
  }

  public stop() {
    this.updateMediaSession(false);
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
  const [track, setTrackState] = useState(() => {
    if (typeof window === 'undefined') return CUSTOM_AMBIENT_TRACK;
    return localStorage.getItem(AMBIENT_TRACK_KEY) || CUSTOM_AMBIENT_TRACK;
  });
  const [isFallback, setIsFallbackState] = useState(false);

  const managerRef = useRef<AmbientManager | null>(null);

  useEffect(() => {
    const mgr = AmbientManager.getInstance();
    managerRef.current = mgr;
    setEnabledState(mgr.isEnabled());
    setVolumeState(mgr.getVolume());
    setTrackState(mgr.getTrack());
    setIsFallbackState(mgr.getIsFallback());

    return mgr.subscribe(() => {
      setEnabledState(mgr.isEnabled());
      setVolumeState(mgr.getVolume());
      setTrackState(mgr.getTrack());
      setIsFallbackState(mgr.getIsFallback());
    });
  }, []);

  const toggle = useCallback(() => {
    const mgr = managerRef.current ?? AmbientManager.getInstance();
    mgr.setEnabled(!mgr.isEnabled());
  }, []);

  const setVolume = useCallback((vol: number) => {
    const mgr = managerRef.current ?? AmbientManager.getInstance();
    mgr.setVolume(vol);
  }, []);

  const setTrack = useCallback((trackPath: string) => {
    const mgr = managerRef.current ?? AmbientManager.getInstance();
    mgr.setTrack(trackPath);
  }, []);

  const fallbackToDefault = useCallback(() => {
    const mgr = managerRef.current ?? AmbientManager.getInstance();
    mgr.fallbackToDefault();
  }, []);

  const play = useCallback(() => {
    const mgr = managerRef.current ?? AmbientManager.getInstance();
    mgr.play();
  }, []);

  const stop = useCallback(() => {
    const mgr = managerRef.current ?? AmbientManager.getInstance();
    mgr.stop();
  }, []);

  const duck = useCallback((ducked: boolean) => {
    const mgr = managerRef.current ?? AmbientManager.getInstance();
    mgr.duck(ducked);
  }, []);

  return {
    enabled,
    volume,
    track,
    isFallback,
    tracks: AMBIENT_TRACKS,
    toggle,
    setVolume,
    setTrack,
    fallbackToDefault,
    play,
    stop,
    duck,
  };
}

export function updateVoiceMediaSession(isPlaying: boolean, title = 'Lord Krishna Speaking') {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  try {
    if (isPlaying) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist: 'Lord Krishna',
        album: 'Bhagavad Gita Sanctuary',
        artwork: [
          { src: '/krishna/avatar-192.webp', sizes: '192x192', type: 'image/webp' },
          { src: '/krishna/avatar-512.webp', sizes: '512x512', type: 'image/webp' },
          { src: '/krishna/portrait-1200.webp', sizes: '1200x1200', type: 'image/webp' },
        ],
      });
      navigator.mediaSession.playbackState = 'playing';
    } else {
      const mgr = AmbientManager.getInstance();
      if (mgr.isEnabled()) {
        mgr.updateMediaSession(true);
      } else {
        navigator.mediaSession.playbackState = 'paused';
      }
    }
  } catch {
    // Ignore environments where MediaSession is restricted
  }
}

