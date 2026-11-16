'use client';

import { useEffect, useRef, useState } from 'react';
import { faceRect, parseObjectPosition, type Rect } from '@/lib/stage-face';
import { avatarEngine } from '../avatar/anam-engine';

/**
 * Krishna's live face, laid exactly over the still "welcome" Krishna in the scene.
 * It sits inside the stage image's box and follows its size and cropping, so the moving face
 * lines up with the painted one; its edges fade into the matching background.
 */
export function StageFace({ live }: { live: boolean }) {
  const frame = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);

  // One shared video element: the face moves here instead of starting a second session.
  useEffect(() => {
    const container = holder.current;
    if (!container) return;
    const engine = avatarEngine();
    engine.adopt(container);
    return () => engine.release(container);
  }, []);

  useEffect(() => {
    const plate = frame.current?.parentElement;
    if (!plate) return;
    const measure = () => {
      const image = plate.querySelector<HTMLImageElement>('img[data-pose="welcome"]');
      const position = parseObjectPosition(image ? getComputedStyle(image).objectPosition : '50% 50%');
      setRect(faceRect({ width: plate.clientWidth, height: plate.clientHeight }, position));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(plate);
    window.addEventListener('orientationchange', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('orientationchange', measure);
    };
  }, []);

  return (
    <div
      ref={frame}
      className="stage-face"
      data-live={live || undefined}
      style={rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : { display: 'none' }}
    >
      <div ref={holder} className="stage-face-video" />
    </div>
  );
}
