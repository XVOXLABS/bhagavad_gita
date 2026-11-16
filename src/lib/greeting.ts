/** What Krishna says when a visitor taps "Meet Krishna". Fixed text, so the voice route never speaks browser input. */
export const KRISHNA_GREETING =
  'Welcome, dear one. I am glad you are here. Tell me what is on your heart, and together we will find a verse of the Gita that speaks to it.';

/**
 * Krishna's fixed lines on the GitaLens stage: what is shown, and what is spoken.
 * The voice route speaks these by id only, so it never takes text from the browser.
 */
export const STAGE_LINES = {
  here: { show: 'I’m here with you.\nTell me what’s\nin your heart. 💙', say: 'I am here with you. Tell me what is in your heart.' },
  share: { show: 'You can share\nyour thoughts,\nconcerns, or\nfeelings with me.', say: 'You can share your thoughts, concerns, or feelings with me.' },
  compassion: {
    show: 'Whatever you share,\nI will listen with compassion\nand guide you with the wisdom\nof the Bhagavad Gita.',
    say: 'Whatever you share, I will listen with compassion, and guide you with the wisdom of the Bhagavad Gita.',
  },
  open: { show: 'So, tell me…\nwhat’s on your mind today?', say: 'So, tell me. What is on your mind today?' },
  question: { show: 'Ask me anything.\nWhat would you like to know?', say: 'Ask me anything. What would you like to know?' },
  verse: { show: 'Which verse shall\nwe sit with?', say: 'Which verse shall we sit with?' },
  more: { show: 'So, tell me…\nwhat else is on your mind?', say: 'So, tell me. What else is on your mind?' },
  guidance: { show: 'What do you need\nguidance with?', say: 'What do you need guidance with?' },
  name: { show: 'Welcome.\nWhat may I call you?', say: 'Welcome. What may I call you?' },
  tone: { show: 'How shall I\nspeak with you?', say: 'How shall I speak with you?' },
  know: { show: 'How well do you\nknow the Gita?', say: 'How well do you know the Gita?' },
} as const;

export type StageLineId = keyof typeof STAGE_LINES;

export function isStageLine(id: string): id is StageLineId {
  return Object.prototype.hasOwnProperty.call(STAGE_LINES, id);
}

/** A name Krishna may say aloud: letters and spaces only, short. Anything else is not spoken. */
export function speakableName(raw: string | null | undefined): string | null {
  const name = (raw ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!name || name.length > 24 || !/^[\p{L}\p{M} ]+$/u.test(name)) return null;
  return name;
}

export function welcomeLine(name: string | null): string {
  return name ? `Welcome, ${name}!` : 'Welcome!';
}
