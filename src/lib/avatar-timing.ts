/** 16 kHz × 16-bit × mono: the raw audio the avatar receives. */
export const PCM_BYTES_PER_SECOND = 32_000;

/** Anam buffers about this much audio before the face starts to move. */
export const RENDER_LEAD_MS = 800;

/**
 * Anam sends no "finished speaking" event for audio we pass in, so the end is worked out
 * from how much audio was sent: the face starts after the lead-in and speaks for the audio's length.
 */
export function speechEndsAt(firstChunkAt: number, bytes: number): number {
  return firstChunkAt + RENDER_LEAD_MS + (bytes / PCM_BYTES_PER_SECOND) * 1000;
}

/**
 * Network chunks can split a 16-bit sample in half. Returns the whole samples to send now
 * and the odd byte to carry into the next chunk.
 */
export function evenChunk(carry: Uint8Array | null, chunk: Uint8Array): { send: Uint8Array; carry: Uint8Array | null } {
  const joined = carry ? new Uint8Array(carry.length + chunk.length) : chunk;
  if (carry) {
    joined.set(carry, 0);
    joined.set(chunk, carry.length);
  }
  const usable = joined.length - (joined.length % 2);
  return {
    send: joined.subarray(0, usable),
    carry: usable < joined.length ? joined.slice(usable) : null,
  };
}

export type AvatarState = 'idle' | 'connecting' | 'ready' | 'speaking' | 'ended' | 'failed';

export type AvatarEvent = 'connect' | 'connected' | 'speak' | 'spoke' | 'closed' | 'error' | 'disconnect';

/**
 * The face's life cycle. "ended" (the plan's session limit was reached) and "failed" both mean
 * Krishna carries on with voice only; a new connect can start another session later.
 */
export function nextAvatarState(state: AvatarState, event: AvatarEvent): AvatarState {
  switch (event) {
    case 'connect':
      return state === 'ready' || state === 'speaking' ? state : 'connecting';
    case 'connected':
      return state === 'connecting' ? 'ready' : state;
    case 'speak':
      return state === 'ready' ? 'speaking' : state;
    case 'spoke':
      return state === 'speaking' ? 'ready' : state;
    case 'closed':
      return state === 'idle' ? 'idle' : 'ended';
    case 'error':
      return 'failed';
    case 'disconnect':
      return 'idle';
  }
}

/** Only a live, idle face takes a new reply; anything else falls back to the voice-only path. */
export function canSpeak(state: AvatarState): boolean {
  return state === 'ready';
}
