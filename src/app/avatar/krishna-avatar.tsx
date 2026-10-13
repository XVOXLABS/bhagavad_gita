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
export function KrishnaAvatar({ size = 'large', label }: { size?: 'large' | 'small'; label?: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const state = useAvatarState();

  useEffect(() => {
    const container = stage.current;
    if (!container) return;
    const engine = avatarEngine();
    engine.adopt(container);
    return () => engine.release(container);
  }, []);

  return (
    <div className={`krishna-face krishna-face-${size}`} data-state={state} data-live={LIVE.includes(state) || undefined}>
      <div className="krishna-face-frame">
        <img className="krishna-face-portrait" src="/krishna/avatar-512.webp" alt="" aria-hidden="true" />
        <div ref={stage} className="krishna-face-stage" />
      </div>
      {state === 'connecting' ? (
        <p className="krishna-face-note" role="status">
          {label ?? 'Krishna is coming…'}
        </p>
      ) : null}
    </div>
  );
}
