import type { AgentAudioInputStream, AnamClient } from '@anam-ai/js-sdk';
import { evenChunk, nextAvatarState, speechEndsAt, type AvatarEvent, type AvatarState } from '@/lib/avatar-timing';

const VIDEO_ID = 'krishna-avatar-video';

export type AvatarSpeakHandlers = {
  onDone: () => void;
  /** The session closed mid-reply (e.g. the plan's time limit); the caller speaks it by voice instead. */
  onLost: () => void;
};

/**
 * One live Anam session shared by every place the face appears. It owns a single <video>
 * that is moved between the Talk screen and the floating card, so switching places never
 * starts a second (billed) session.
 */
class AnamEngine {
  state: AvatarState = 'idle';
  private client: AnamClient | null = null;
  private input: AgentAudioInputStream | null = null;
  private connecting: Promise<boolean> | null = null;
  private abort: AbortController | null = null;
  private timer: number | null = null;
  private limitTimer: number | null = null;
  private handlers: AvatarSpeakHandlers | null = null;
  private listeners = new Set<(state: AvatarState) => void>();
  private video: HTMLVideoElement | null = null;
  private holder: HTMLElement | null = null;

  subscribe(listener: (state: AvatarState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private move(event: AvatarEvent) {
    const next = nextAvatarState(this.state, event);
    if (next === this.state) return;
    this.state = next;
    for (const listener of this.listeners) listener(next);
  }

  /** The face's video element; lives in a hidden holder until a placement adopts it. */
  videoElement(): HTMLVideoElement {
    if (!this.video) {
      this.holder = document.createElement('div');
      this.holder.hidden = true;
      document.body.appendChild(this.holder);
      const video = document.createElement('video');
      video.id = VIDEO_ID;
      video.autoplay = true;
      video.playsInline = true;
      video.className = 'krishna-face-video';
      this.holder.appendChild(video);
      this.video = video;
    }
    return this.video;
  }

  adopt(container: HTMLElement) {
    const video = this.videoElement();
    if (video.parentElement !== container) container.appendChild(video);
    void video.play().catch(() => undefined);
  }

  release(container: HTMLElement) {
    const video = this.video;
    if (video && video.parentElement === container && this.holder) this.holder.appendChild(video);
  }

  /** Starts a session (once); resolves true when the face is ready to speak. */
  connect(): Promise<boolean> {
    if (this.state === 'ready' || this.state === 'speaking') return Promise.resolve(true);
    if (this.connecting) return this.connecting;
    this.move('connect');
    this.connecting = (async () => {
      try {
        const response = await fetch('/api/avatar/session', { method: 'POST' });
        if (!response.ok) {
          const { error } = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(`Avatar session refused by our server (${response.status} ${error ?? ''}); see the server terminal for "avatar_session_failed"`);
        }
        const { sessionToken, maxSeconds } = (await response.json()) as { sessionToken?: string; maxSeconds?: number };
        if (!sessionToken) throw new Error('no token');
        const { createClient, AnamEvent } = await import('@anam-ai/js-sdk');
        // Our own recorder keeps the microphone; Anam only draws and plays the face.
        const client = createClient(sessionToken, { disableInputAudio: true });
        this.client = client;
        client.addListener(AnamEvent.CONNECTION_CLOSED, () => {
          if (this.client !== client) return;
          this.handleClosed();
        });
        this.videoElement();
        await client.streamToVideoElement(VIDEO_ID);
        if (this.client !== client) return false;
        this.input = client.createAgentAudioInputStream({ encoding: 'pcm_s16le', sampleRate: 16000, channels: 1 });
        this.move('connected');
        // Our own cap on session length, since the passthrough config cannot carry one.
        if (maxSeconds && maxSeconds > 0) {
          this.limitTimer = window.setTimeout(() => {
            if (this.client === client) this.handleClosed();
          }, maxSeconds * 1000);
        }
        return true;
      } catch (error) {
        // Shown in the browser console so a failed face can be diagnosed; it never contains keys.
        // The Anam SDK puts the server's real reason in `cause`; print both.
        const cause = error instanceof Error ? (error as Error & { cause?: unknown }).cause : undefined;
        console.warn(
          '[Krishna face] could not start:',
          error instanceof Error ? error.message : error,
          cause ? `| Anam says: ${typeof cause === 'string' ? cause : JSON.stringify(cause)}` : '',
        );
        this.teardown();
        this.move('error');
        return false;
      } finally {
        this.connecting = null;
      }
    })();
    return this.connecting;
  }

  /**
   * Streams one reply's raw audio into the face. Resolves false when the face could not take it,
   * so the caller can use the voice-only path instead.
   */
  async speak(url: string, handlers: AvatarSpeakHandlers): Promise<boolean> {
    if (this.state !== 'ready' || !this.input) return false;
    this.cancelSpeech();
    const abort = new AbortController();
    this.abort = abort;
    let response: Response;
    try {
      response = await fetch(url, { signal: abort.signal });
    } catch {
      return false;
    }
    if (!response.ok || !response.body || abort.signal.aborted || this.state !== 'ready' || !this.input) return false;

    this.handlers = handlers;
    this.move('speak');
    const input = this.input;
    const reader = response.body.getReader();
    let carry: Uint8Array | null = null;
    let bytes = 0;
    let firstAt = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (abort.signal.aborted || this.input !== input) return true;
        const piece = evenChunk(carry, value);
        carry = piece.carry;
        if (piece.send.length === 0) continue;
        if (!firstAt) firstAt = Date.now();
        bytes += piece.send.length;
        input.sendAudioChunk(piece.send);
      }
      input.endSequence();
    } catch {
      if (abort.signal.aborted || this.input !== input) return true;
      input.endSequence();
    }
    if (!firstAt) {
      this.finish();
      return true;
    }
    this.timer = window.setTimeout(() => this.finish(), Math.max(0, speechEndsAt(firstAt, bytes) - Date.now()));
    return true;
  }

  private finish() {
    this.timer = null;
    this.abort = null;
    const handlers = this.handlers;
    this.handlers = null;
    this.move('spoke');
    handlers?.onDone();
  }

  private cancelSpeech() {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.abort?.abort();
    this.abort = null;
    this.handlers = null;
  }

  /** Stops the current reply at once (tap, Space or a new reply). */
  stop() {
    const wasSpeaking = this.state === 'speaking';
    this.cancelSpeech();
    if (wasSpeaking) {
      try {
        this.client?.interruptPersona();
        this.input?.endSequence();
      } catch {
        // The session may already be gone.
      }
      this.move('spoke');
    }
  }

  private handleClosed() {
    const handlers = this.handlers;
    this.cancelSpeech();
    this.teardown();
    this.move('closed');
    handlers?.onLost();
  }

  private teardown() {
    if (this.limitTimer !== null) window.clearTimeout(this.limitTimer);
    this.limitTimer = null;
    const client = this.client;
    this.client = null;
    this.input = null;
    if (client) void client.stopStreaming().catch(() => undefined);
    if (this.video) this.video.srcObject = null;
  }

  /** Ends the session so no more minutes are used. */
  disconnect() {
    this.cancelSpeech();
    this.teardown();
    this.move('disconnect');
  }
}

let engine: AnamEngine | null = null;

export function avatarEngine(): AnamEngine {
  engine ??= new AnamEngine();
  return engine;
}

export type { AnamEngine };
