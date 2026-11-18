'use client';

import { useEffect, useRef, useState } from 'react';
import type { AvatarState } from '@/lib/avatar-timing';
import { avatarEngine } from './anam-engine';

/** The live face's state, for showing the portrait while it connects or after it ends. */
export function useAvatarState(): AvatarState {
  const [state, setState] = useState<AvatarState>('idle');
  useEffect(() => {
    const engine = avatarEngine();
    setState(engine.state);
    return engine.subscribe(setState);
  }, []);
  return state;
}

const LIVE: AvatarState[] = ['ready', 'speaking'];

/**
 * Krishna's face. The still portrait is always underneath; the live video fades in over it
 * once the session is ready, and fades away again if it ends or fails.
 */
export function KrishnaAvatar({ size = 'fullscreen', label }: { size?: 'large' | 'small' | 'fullscreen'; label?: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const state = useAvatarState();

  useEffect(() => {
    const container = stage.current;
    if (!container) return;
    const engine = avatarEngine();
    engine.adopt(container);
    return () => engine.release(container);
  }, []);

  const portraitSrc = size === 'fullscreen' ? '/krishna/portrait-1200.webp' : '/krishna/avatar-512.webp';

  return (
    <div className={`krishna-face krishna-face-${size}`} data-state={state} data-live={LIVE.includes(state) || undefined}>
      <div className="krishna-face-frame">
        <img className="krishna-face-portrait" src={portraitSrc} alt="Krishna" aria-hidden="true" />
        <div ref={stage} className="krishna-face-stage" />
      </div>
      {state === 'connecting' ? (
        <div className="krishna-loading-pill" role="status">
          <span className="loading-lotus-spin">🪷</span>
          <span className="loading-text">{label ?? 'Krishna is arriving…'}</span>
        </div>
      ) : null}
    </div>
  );
}
